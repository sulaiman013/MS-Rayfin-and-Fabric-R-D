-- ============================================================================
-- sp_build_gold: rebuild the gold star schema = cleaned historical (silver)
-- UNION the LIVE app leads (the app's SQL database auto-mirrors to OneLake; we
-- read it cross-database). Run this to refresh the dashboard after app writeback.
-- ============================================================================
CREATE OR ALTER PROCEDURE dbo.sp_build_gold AS
BEGIN
  -- ---- Dimensions (conformed; built from the historical silver members) ----
  DROP TABLE IF EXISTS dbo.DimStage;
  CREATE TABLE dbo.DimStage AS
    SELECT StageKey, StageName, StageOrder
    FROM (VALUES (1,'New',1),(2,'Consult',2),(3,'Quote',3),(4,'Won',4),(5,'Lost',5)) AS t(StageKey, StageName, StageOrder);

  DROP TABLE IF EXISTS dbo.DimRep;
  CREATE TABLE dbo.DimRep AS
    SELECT CAST(ROW_NUMBER() OVER (ORDER BY ord, RepName) - 1 AS int) AS RepKey,
           RepName, Showroom, CAST(1 AS int) AS IsActive, CAST('hist' AS varchar(10)) AS SourceSystem
    FROM (
      SELECT DISTINCT RepName, CASE WHEN RepName='Unknown' THEN 0 ELSE 1 END AS ord,
        CASE RepName WHEN 'Maria Lopez' THEN 'austin' WHEN 'Devon Carter' THEN 'la'
             WHEN 'Priya Shah' THEN 'online' WHEN 'Sam Okafor' THEN 'dallas' ELSE 'unknown' END AS Showroom
      FROM silver.LeadClean
    ) r;

  DROP TABLE IF EXISTS dbo.DimLeadSource;
  CREATE TABLE dbo.DimLeadSource AS
    SELECT CAST(ROW_NUMBER() OVER (ORDER BY ord, LeadSourceName) - 1 AS int) AS LeadSourceKey, LeadSourceName, Channel
    FROM (
      SELECT DISTINCT LeadSourceName, CASE WHEN LeadSourceName='Unknown' THEN 0 ELSE 1 END AS ord,
        CASE LeadSourceName WHEN 'Google Ads' THEN 'ad' WHEN 'Houzz' THEN 'web'
             WHEN 'Referral Past Client' THEN 'referral' WHEN 'Showroom Walk-in' THEN 'showroom'
             WHEN 'Instagram' THEN 'ad' ELSE 'unknown' END AS Channel
      FROM silver.LeadClean
    ) s;

  DROP TABLE IF EXISTS dbo.DimDate;
  CREATE TABLE dbo.DimDate AS
    SELECT CAST(YEAR(d)*10000+MONTH(d)*100+DAY(d) AS int) AS DateKey, d AS [Date], CAST(YEAR(d) AS int) AS [Year],
      CAST('Q'+CAST(DATEPART(quarter,d) AS varchar(1)) AS varchar(2)) AS Quarter, CAST(MONTH(d) AS int) AS MonthNumber,
      CAST(DATENAME(month,d) AS varchar(12)) AS MonthName,
      CAST(CAST(YEAR(d) AS varchar(4))+'-'+RIGHT('0'+CAST(MONTH(d) AS varchar(2)),2) AS varchar(7)) AS YearMonth,
      CAST(DATENAME(weekday,d) AS varchar(10)) AS DayOfWeek,
      CAST(CASE WHEN DATEPART(weekday,d) IN (1,7) THEN 1 ELSE 0 END AS int) AS IsWeekend
    FROM (SELECT DATEADD(day, n, CAST('2023-01-01' AS date)) AS d
          FROM (SELECT (a.v+b.v*10+c.v*100+e.v*1000) AS n
                FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) a(v)
                CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) b(v)
                CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) c(v)
                CROSS JOIN (VALUES (0),(1)) e(v)) nums WHERE n < 1826) dates;

  -- ---- FactLead = historical (silver) UNION live (app mirror) ----
  DROP TABLE IF EXISTS dbo.FactLead;
  CREATE TABLE dbo.FactLead AS
    SELECT CAST(ROW_NUMBER() OVER (ORDER BY u.SourceSystem, u.LeadBK) AS int) AS LeadKey,
      u.LeadBK, u.CustomerName, u.RepKey, u.LeadSourceKey, u.CurrentStageKey, u.CreatedDateKey, u.WonDateKey,
      u.ProjectType, u.EstimatedValue, u.IsWon, u.IsLost, u.IsOpen,
      CAST(YEAR(u.LastEventDate)*10000+MONTH(u.LastEventDate)*100+DAY(u.LastEventDate) AS int) AS LastEventDateKey,
      CAST(CASE WHEN u.IsOpen=1 AND DATEDIFF(day, u.LastEventDate, CAST(GETDATE() AS date)) > 14 THEN 1 ELSE 0 END AS int) AS IsStalled,
      u.SourceSystem
    FROM (
      -- historical arm
      SELECT CAST('hist:'+lc.LeadId AS varchar(60)) AS LeadBK, lc.CustomerName,
        dr.RepKey, ds.LeadSourceKey,
        CAST(CASE lc.Stage WHEN 'new' THEN 1 WHEN 'consult' THEN 2 WHEN 'quote' THEN 3 WHEN 'won' THEN 4 WHEN 'lost' THEN 5 END AS int) AS CurrentStageKey,
        CAST(YEAR(lc.CreatedDate)*10000+MONTH(lc.CreatedDate)*100+DAY(lc.CreatedDate) AS int) AS CreatedDateKey,
        CAST(CASE WHEN lc.WonDate IS NOT NULL THEN YEAR(lc.WonDate)*10000+MONTH(lc.WonDate)*100+DAY(lc.WonDate) END AS int) AS WonDateKey,
        lc.ProjectType, lc.EstimatedValue,
        CAST(CASE WHEN lc.Stage='won' THEN 1 ELSE 0 END AS int) AS IsWon,
        CAST(CASE WHEN lc.Stage='lost' THEN 1 ELSE 0 END AS int) AS IsLost,
        CAST(CASE WHEN lc.Stage IN ('new','consult','quote') THEN 1 ELSE 0 END AS int) AS IsOpen,
        lev.LastEventDate, CAST('hist' AS varchar(10)) AS SourceSystem
      FROM silver.LeadClean lc
      JOIN dbo.DimRep dr ON dr.RepName = lc.RepName
      JOIN dbo.DimLeadSource ds ON ds.LeadSourceName = lc.LeadSourceName
      CROSS APPLY (VALUES (COALESCE(
        CASE lc.Stage WHEN 'won' THEN lc.WonDate WHEN 'lost' THEN lc.LastUpdated
             WHEN 'quote' THEN DATEADD(day,7,lc.ConsultDate) WHEN 'consult' THEN lc.ConsultDate
             WHEN 'new' THEN lc.CreatedDate END, lc.CreatedDate))) lev(LastEventDate)
      UNION ALL
      -- live arm (the app's mirrored Leads)
      SELECT CAST('live:'+CAST(l.id AS varchar(40)) AS varchar(60)) AS LeadBK, l.customerName,
        COALESCE(dr.RepKey, 0), COALESCE(dls.LeadSourceKey, 0),
        CAST(CASE l.stage WHEN 'new' THEN 1 WHEN 'consult' THEN 2 WHEN 'quote' THEN 3 WHEN 'won' THEN 4 WHEN 'lost' THEN 5 END AS int),
        CAST(YEAR(l.createdAt)*10000+MONTH(l.createdAt)*100+DAY(l.createdAt) AS int),
        CAST(CASE WHEN l.stage='won' THEN YEAR(l.updatedAt)*10000+MONTH(l.updatedAt)*100+DAY(l.updatedAt) END AS int),
        l.projectType, CAST(l.estimatedValue AS decimal(12,2)),
        CAST(CASE WHEN l.stage='won' THEN 1 ELSE 0 END AS int),
        CAST(CASE WHEN l.stage='lost' THEN 1 ELSE 0 END AS int),
        CAST(CASE WHEN l.stage IN ('new','consult','quote') THEN 1 ELSE 0 END AS int),
        CAST(l.updatedAt AS date), CAST('live' AS varchar(10))
      FROM [lead-pipeline-app].dbo.Leads l
      LEFT JOIN [lead-pipeline-app].dbo.Reps r ON l.rep_id = r.id
      LEFT JOIN dbo.DimRep dr ON dr.RepName = r.name
      LEFT JOIN [lead-pipeline-app].dbo.LeadSources src ON l.leadSource_id = src.id
      LEFT JOIN dbo.DimLeadSource dls ON dls.LeadSourceName = src.name
    ) u;

  -- ---- FactStageEvent = historical synthesized UNION live StageEvents ----
  DROP TABLE IF EXISTS dbo.FactStageEvent;
  CREATE TABLE dbo.FactStageEvent AS
    SELECT CAST(ROW_NUMBER() OVER (ORDER BY ev.LeadKey, ev.StageKey) AS int) AS StageEventKey,
      ev.LeadKey, ev.StageKey,
      CAST(YEAR(ev.EnteredDate)*10000+MONTH(ev.EnteredDate)*100+DAY(ev.EnteredDate) AS int) AS EnteredDateKey,
      CAST(DATEDIFF(day, ev.EnteredDate, LEAD(ev.EnteredDate) OVER (PARTITION BY ev.LeadKey ORDER BY ev.StageKey)) AS int) AS DurationDays,
      ev.RepKey, ev.LeadSourceKey, ev.SourceSystem
    FROM (
      -- historical synthesized events
      SELECT fl.LeadKey, 1 AS StageKey, lc.CreatedDate AS EnteredDate, fl.RepKey, fl.LeadSourceKey, CAST('hist' AS varchar(10)) AS SourceSystem
      FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:'+lc.LeadId
      UNION ALL SELECT fl.LeadKey, 2, lc.ConsultDate, fl.RepKey, fl.LeadSourceKey, 'hist'
      FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:'+lc.LeadId WHERE lc.ConsultDate IS NOT NULL
      UNION ALL SELECT fl.LeadKey, 3, COALESCE(DATEADD(day,7,lc.ConsultDate), DATEADD(day,12,lc.CreatedDate)), fl.RepKey, fl.LeadSourceKey, 'hist'
      FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:'+lc.LeadId WHERE lc.Stage IN ('won','lost','quote')
      UNION ALL SELECT fl.LeadKey, 4, lc.WonDate, fl.RepKey, fl.LeadSourceKey, 'hist'
      FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:'+lc.LeadId WHERE lc.Stage='won'
      UNION ALL SELECT fl.LeadKey, 5, lc.LastUpdated, fl.RepKey, fl.LeadSourceKey, 'hist'
      FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:'+lc.LeadId WHERE lc.Stage='lost'
      -- live events
      UNION ALL SELECT fl.LeadKey,
        CAST(CASE se.stage WHEN 'new' THEN 1 WHEN 'consult' THEN 2 WHEN 'quote' THEN 3 WHEN 'won' THEN 4 WHEN 'lost' THEN 5 END AS int),
        CAST(se.enteredAt AS date), fl.RepKey, fl.LeadSourceKey, CAST('live' AS varchar(10))
      FROM [lead-pipeline-app].dbo.StageEvents se
      JOIN dbo.FactLead fl ON fl.LeadBK = 'live:'+CAST(se.lead_id AS varchar(40))
    ) ev;
END;
GO

EXEC dbo.sp_build_gold;
GO

-- validation
SELECT SourceSystem, COUNT(*) AS leads FROM dbo.FactLead GROUP BY SourceSystem;
GO
SELECT SUM(IsWon) AS Won, SUM(IsLost) AS Lost, SUM(IsOpen) AS Open_,
       CAST(100.0*SUM(IsWon)/NULLIF(SUM(IsWon)+SUM(IsLost),0) AS decimal(5,1)) AS WinRatePct,
       SUM(CASE WHEN IsOpen=1 THEN EstimatedValue ELSE 0 END) AS Pipeline, SUM(IsStalled) AS Stalled
FROM dbo.FactLead;
GO
