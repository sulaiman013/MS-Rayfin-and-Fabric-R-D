-- ============================================================================
-- GOLD: conformed star schema (materialized CTAS Delta) for Direct Lake.
-- Built from silver.LeadClean (historical). Live app data is unioned later.
-- ============================================================================

-- ---------------- DimStage (fixed funnel order) ----------------
DROP TABLE IF EXISTS dbo.DimStage;
GO
CREATE TABLE dbo.DimStage AS
SELECT StageKey, StageName, StageOrder
FROM (VALUES (1,'New',1),(2,'Consult',2),(3,'Quote',3),(4,'Won',4),(5,'Lost',5)) AS t(StageKey, StageName, StageOrder);
GO

-- ---------------- DimRep (4 reps + Unknown=0) ----------------
DROP TABLE IF EXISTS dbo.DimRep;
GO
CREATE TABLE dbo.DimRep AS
SELECT CAST(ROW_NUMBER() OVER (ORDER BY ord, RepName) - 1 AS int) AS RepKey,
       RepName, Showroom, CAST(1 AS int) AS IsActive, CAST('hist' AS varchar(10)) AS SourceSystem
FROM (
  SELECT DISTINCT RepName,
         CASE WHEN RepName = 'Unknown' THEN 0 ELSE 1 END AS ord,
         CASE RepName WHEN 'Maria Lopez' THEN 'austin' WHEN 'Devon Carter' THEN 'la'
                      WHEN 'Priya Shah' THEN 'online' WHEN 'Sam Okafor' THEN 'dallas'
                      ELSE 'unknown' END AS Showroom
  FROM silver.LeadClean
) r;
GO

-- ---------------- DimLeadSource (5 sources + Unknown=0) ----------------
DROP TABLE IF EXISTS dbo.DimLeadSource;
GO
CREATE TABLE dbo.DimLeadSource AS
SELECT CAST(ROW_NUMBER() OVER (ORDER BY ord, LeadSourceName) - 1 AS int) AS LeadSourceKey,
       LeadSourceName, Channel
FROM (
  SELECT DISTINCT LeadSourceName,
         CASE WHEN LeadSourceName = 'Unknown' THEN 0 ELSE 1 END AS ord,
         CASE LeadSourceName WHEN 'Google Ads' THEN 'ad' WHEN 'Houzz' THEN 'web'
              WHEN 'Referral Past Client' THEN 'referral' WHEN 'Showroom Walk-in' THEN 'showroom'
              WHEN 'Instagram' THEN 'ad' ELSE 'unknown' END AS Channel
  FROM silver.LeadClean
) s;
GO

-- ---------------- DimDate (2023-01-01 .. 2027-12-31) ----------------
DROP TABLE IF EXISTS dbo.DimDate;
GO
CREATE TABLE dbo.DimDate AS
SELECT
  CAST(YEAR(d)*10000 + MONTH(d)*100 + DAY(d) AS int) AS DateKey,
  d AS [Date], CAST(YEAR(d) AS int) AS [Year],
  CAST('Q' + CAST(DATEPART(quarter, d) AS varchar(1)) AS varchar(2)) AS Quarter,
  CAST(MONTH(d) AS int) AS MonthNumber,
  CAST(DATENAME(month, d) AS varchar(12)) AS MonthName,
  CAST(CAST(YEAR(d) AS varchar(4)) + '-' + RIGHT('0' + CAST(MONTH(d) AS varchar(2)), 2) AS varchar(7)) AS YearMonth,
  CAST(DATENAME(weekday, d) AS varchar(10)) AS DayOfWeek,
  CAST(CASE WHEN DATEPART(weekday, d) IN (1,7) THEN 1 ELSE 0 END AS int) AS IsWeekend
FROM (
  SELECT DATEADD(day, n, CAST('2023-01-01' AS date)) AS d
  FROM (
    SELECT (a.v + b.v*10 + c.v*100 + e.v*1000) AS n
    FROM (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) a(v)
    CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) b(v)
    CROSS JOIN (VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9)) c(v)
    CROSS JOIN (VALUES (0),(1)) e(v)
  ) nums
  WHERE n < 1826
) dates;
GO

-- ---------------- FactLead ----------------
DROP TABLE IF EXISTS dbo.FactLead;
GO
CREATE TABLE dbo.FactLead AS
SELECT
  CAST(ROW_NUMBER() OVER (ORDER BY lc.LeadId) AS int) AS LeadKey,
  CAST('hist:' + lc.LeadId AS varchar(60)) AS LeadBK,
  lc.CustomerName,
  dr.RepKey, ds.LeadSourceKey,
  CAST(CASE lc.Stage WHEN 'new' THEN 1 WHEN 'consult' THEN 2 WHEN 'quote' THEN 3
                     WHEN 'won' THEN 4 WHEN 'lost' THEN 5 END AS int) AS CurrentStageKey,
  CAST(YEAR(lc.CreatedDate)*10000 + MONTH(lc.CreatedDate)*100 + DAY(lc.CreatedDate) AS int) AS CreatedDateKey,
  CAST(CASE WHEN lc.WonDate IS NOT NULL
            THEN YEAR(lc.WonDate)*10000 + MONTH(lc.WonDate)*100 + DAY(lc.WonDate) END AS int) AS WonDateKey,
  lc.ProjectType, lc.EstimatedValue,
  CAST(CASE WHEN lc.Stage = 'won' THEN 1 ELSE 0 END AS int) AS IsWon,
  CAST(CASE WHEN lc.Stage = 'lost' THEN 1 ELSE 0 END AS int) AS IsLost,
  CAST(CASE WHEN lc.Stage IN ('new','consult','quote') THEN 1 ELSE 0 END AS int) AS IsOpen,
  CAST(YEAR(lev.LastEventDate)*10000 + MONTH(lev.LastEventDate)*100 + DAY(lev.LastEventDate) AS int) AS LastEventDateKey,
  CAST(CASE WHEN lc.Stage IN ('new','consult','quote')
                 AND DATEDIFF(day, lev.LastEventDate, CAST(GETDATE() AS date)) > 14
            THEN 1 ELSE 0 END AS int) AS IsStalled,
  CAST('hist' AS varchar(10)) AS SourceSystem
FROM silver.LeadClean lc
JOIN dbo.DimRep dr ON dr.RepName = lc.RepName
JOIN dbo.DimLeadSource ds ON ds.LeadSourceName = lc.LeadSourceName
CROSS APPLY (VALUES (COALESCE(
    CASE lc.Stage WHEN 'won' THEN lc.WonDate
                  WHEN 'lost' THEN lc.LastUpdated
                  WHEN 'quote' THEN DATEADD(day, 7, lc.ConsultDate)
                  WHEN 'consult' THEN lc.ConsultDate
                  WHEN 'new' THEN lc.CreatedDate END,
    lc.CreatedDate))) lev(LastEventDate);
GO

-- ---------------- FactStageEvent (synthesized funnel history) ----------------
DROP TABLE IF EXISTS dbo.FactStageEvent;
GO
CREATE TABLE dbo.FactStageEvent AS
SELECT
  CAST(ROW_NUMBER() OVER (ORDER BY ev.LeadKey, ev.StageKey) AS int) AS StageEventKey,
  ev.LeadKey, ev.StageKey,
  CAST(YEAR(ev.EnteredDate)*10000 + MONTH(ev.EnteredDate)*100 + DAY(ev.EnteredDate) AS int) AS EnteredDateKey,
  CAST(DATEDIFF(day, ev.EnteredDate,
       LEAD(ev.EnteredDate) OVER (PARTITION BY ev.LeadKey ORDER BY ev.StageKey)) AS int) AS DurationDays,
  ev.RepKey, ev.LeadSourceKey, CAST('hist' AS varchar(10)) AS SourceSystem
FROM (
  SELECT fl.LeadKey, 1 AS StageKey, lc.CreatedDate AS EnteredDate, fl.RepKey, fl.LeadSourceKey
  FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:' + lc.LeadId
  UNION ALL
  SELECT fl.LeadKey, 2, lc.ConsultDate, fl.RepKey, fl.LeadSourceKey
  FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:' + lc.LeadId
  WHERE lc.ConsultDate IS NOT NULL
  UNION ALL
  SELECT fl.LeadKey, 3, COALESCE(DATEADD(day, 7, lc.ConsultDate), DATEADD(day, 12, lc.CreatedDate)), fl.RepKey, fl.LeadSourceKey
  FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:' + lc.LeadId
  WHERE lc.Stage IN ('won','lost','quote')
  UNION ALL
  SELECT fl.LeadKey, 4, lc.WonDate, fl.RepKey, fl.LeadSourceKey
  FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:' + lc.LeadId
  WHERE lc.Stage = 'won'
  UNION ALL
  SELECT fl.LeadKey, 5, lc.LastUpdated, fl.RepKey, fl.LeadSourceKey
  FROM silver.LeadClean lc JOIN dbo.FactLead fl ON fl.LeadBK = 'hist:' + lc.LeadId
  WHERE lc.Stage = 'lost'
) ev;
GO

-- ---------------- Validation against ground truth ----------------
SELECT 'DimRep' AS tbl, COUNT(*) AS n FROM dbo.DimRep
UNION ALL SELECT 'DimLeadSource', COUNT(*) FROM dbo.DimLeadSource
UNION ALL SELECT 'DimStage', COUNT(*) FROM dbo.DimStage
UNION ALL SELECT 'DimDate', COUNT(*) FROM dbo.DimDate
UNION ALL SELECT 'FactLead (400)', COUNT(*) FROM dbo.FactLead
UNION ALL SELECT 'FactStageEvent', COUNT(*) FROM dbo.FactStageEvent;
GO
SELECT
  SUM(IsWon) AS WonLeads, SUM(IsLost) AS LostLeads, SUM(IsOpen) AS OpenLeads,
  CAST(100.0 * SUM(IsWon) / NULLIF(SUM(IsWon) + SUM(IsLost), 0) AS decimal(5,1)) AS WinRatePct,
  SUM(CASE WHEN IsWon = 1 THEN EstimatedValue ELSE 0 END) AS WonValue,
  SUM(CASE WHEN IsOpen = 1 THEN EstimatedValue ELSE 0 END) AS PipelineValue,
  SUM(IsStalled) AS StalledLeads
FROM dbo.FactLead;
GO
SELECT s.StageName, COUNT(DISTINCT e.LeadKey) AS LeadsReaching
FROM dbo.FactStageEvent e JOIN dbo.DimStage s ON s.StageKey = e.StageKey
GROUP BY s.StageName, s.StageOrder ORDER BY s.StageOrder;
GO
