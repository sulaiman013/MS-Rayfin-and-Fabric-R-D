-- ============================================================================
-- SILVER: clean, type, conform, and dedup the messy historical bronze.
-- Reads the Lakehouse bronze cross-database; writes silver.* tables in the Warehouse.
-- ============================================================================
IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'silver') EXEC('CREATE SCHEMA silver');
GO

-- ---- Stage: parse every value, conform every dimension member (all 430 rows) ----
DROP TABLE IF EXISTS silver.LeadStage;
GO
CREATE TABLE silver.LeadStage AS
SELECT
  LTRIM(RTRIM(b.lead_id_legacy)) AS LeadId,
  LTRIM(RTRIM(b.Customer_Name))  AS CustomerName,
  -- normalized name, handling "Last, First" -> "first last"
  LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(
    CASE WHEN CHARINDEX(',', b.Customer_Name) > 0
         THEN LOWER(LTRIM(RTRIM(SUBSTRING(b.Customer_Name, CHARINDEX(',', b.Customer_Name) + 1, 200)))
                    + ' ' + LTRIM(RTRIM(SUBSTRING(b.Customer_Name, 1, CHARINDEX(',', b.Customer_Name) - 1))))
         ELSE LOWER(LTRIM(RTRIM(b.Customer_Name))) END
  , '  ', ' '), '  ', ' '), '  ', ' '))) AS NormName,
  NULLIF(NULLIF(NULLIF(LOWER(LTRIM(RTRIM(b.customer_email))), 'n/a'), ''), '-') AS Email,
  -- currency parse: strip $ , spaces; negatives -> NULL
  CASE WHEN TRY_CAST(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(b.Estimated_Value)), '$', ''), ',', ''), ' ', '') AS decimal(12,2)) < 0
       THEN NULL
       ELSE TRY_CAST(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(b.Estimated_Value)), '$', ''), ',', ''), ' ', '') AS decimal(12,2)) END AS EstimatedValue,
  -- stage conform
  CASE
    WHEN LOWER(LTRIM(RTRIM(b.Stage))) IN ('won','closed won','win','w')          THEN 'won'
    WHEN LOWER(LTRIM(RTRIM(b.Stage))) IN ('lost','closed lost','dead','l')        THEN 'lost'
    WHEN LOWER(LTRIM(RTRIM(b.Stage))) IN ('new','lead','inbound')                 THEN 'new'
    WHEN LOWER(LTRIM(RTRIM(b.Stage))) IN ('consult','consultation','design consult') THEN 'consult'
    WHEN LOWER(LTRIM(RTRIM(b.Stage))) IN ('quote','quoted','proposal','q')        THEN 'quote'
    ELSE 'unknown' END AS Stage,
  -- source conform
  CASE
    WHEN LOWER(b.Source) LIKE '%houz%' THEN 'Houzz'
    WHEN LOWER(b.Source) LIKE '%google%' OR LOWER(b.Source) LIKE '%adword%' THEN 'Google Ads'
    WHEN LOWER(b.Source) LIKE '%referr%' OR LOWER(b.Source) LIKE '%past client%' THEN 'Referral Past Client'
    WHEN LOWER(b.Source) LIKE '%showroom%' OR LOWER(b.Source) LIKE '%walk%' THEN 'Showroom Walk-in'
    WHEN LOWER(b.Source) LIKE '%insta%' OR LOWER(LTRIM(RTRIM(b.Source))) = 'ig' THEN 'Instagram'
    ELSE 'Unknown' END AS LeadSourceName,
  -- rep conform
  CASE
    WHEN LOWER(b.Rep) LIKE '%lopez%' OR LOWER(b.Rep) LIKE '%lopz%' THEN 'Maria Lopez'
    WHEN LOWER(b.Rep) LIKE '%carter%' THEN 'Devon Carter'
    WHEN LOWER(b.Rep) LIKE '%shah%' THEN 'Priya Shah'
    WHEN LOWER(b.Rep) LIKE '%okaf%' THEN 'Sam Okafor'
    ELSE 'Unknown' END AS RepName,
  -- project conform
  CASE
    WHEN LOWER(b.project_type) LIKE '%walk%' OR LOWER(b.project_type) LIKE '%wic%' OR LOWER(b.project_type) LIKE '%reach%' THEN 'Walk-in closet'
    WHEN LOWER(b.project_type) LIKE '%garage%' THEN 'Garage'
    WHEN LOWER(b.project_type) LIKE '%pantry%' THEN 'Pantry'
    WHEN LOWER(b.project_type) LIKE '%office%' THEN 'Home office'
    ELSE 'Other' END AS ProjectType,
  -- dates: ISO -> US -> month-name -> Excel serial
  COALESCE(TRY_CONVERT(date, LTRIM(RTRIM(b.created)), 23), TRY_CONVERT(date, LTRIM(RTRIM(b.created)), 101),
           TRY_CONVERT(date, LTRIM(RTRIM(b.created)), 107), TRY_CONVERT(date, LTRIM(RTRIM(b.created)), 100), TRY_CONVERT(date, LTRIM(RTRIM(b.created))),
           CASE WHEN LTRIM(RTRIM(b.created)) NOT LIKE '%[^0-9]%' AND LEN(LTRIM(RTRIM(b.created))) = 5
                     AND TRY_CAST(LTRIM(RTRIM(b.created)) AS int) BETWEEN 40000 AND 50000
                THEN DATEADD(day, TRY_CAST(LTRIM(RTRIM(b.created)) AS int), CAST('1899-12-30' AS date)) END) AS CreatedDate,
  COALESCE(TRY_CONVERT(date, LTRIM(RTRIM(b.consult_date)), 23), TRY_CONVERT(date, LTRIM(RTRIM(b.consult_date)), 101),
           TRY_CONVERT(date, LTRIM(RTRIM(b.consult_date)), 107), TRY_CONVERT(date, LTRIM(RTRIM(b.consult_date)), 100), TRY_CONVERT(date, LTRIM(RTRIM(b.consult_date))),
           CASE WHEN LTRIM(RTRIM(b.consult_date)) NOT LIKE '%[^0-9]%' AND LEN(LTRIM(RTRIM(b.consult_date))) = 5
                     AND TRY_CAST(LTRIM(RTRIM(b.consult_date)) AS int) BETWEEN 40000 AND 50000
                THEN DATEADD(day, TRY_CAST(LTRIM(RTRIM(b.consult_date)) AS int), CAST('1899-12-30' AS date)) END) AS ConsultDate,
  COALESCE(TRY_CONVERT(date, LTRIM(RTRIM(b.won_date)), 23), TRY_CONVERT(date, LTRIM(RTRIM(b.won_date)), 101),
           TRY_CONVERT(date, LTRIM(RTRIM(b.won_date)), 107), TRY_CONVERT(date, LTRIM(RTRIM(b.won_date)), 100), TRY_CONVERT(date, LTRIM(RTRIM(b.won_date))),
           CASE WHEN LTRIM(RTRIM(b.won_date)) NOT LIKE '%[^0-9]%' AND LEN(LTRIM(RTRIM(b.won_date))) = 5
                     AND TRY_CAST(LTRIM(RTRIM(b.won_date)) AS int) BETWEEN 40000 AND 50000
                THEN DATEADD(day, TRY_CAST(LTRIM(RTRIM(b.won_date)) AS int), CAST('1899-12-30' AS date)) END) AS WonDate,
  COALESCE(TRY_CONVERT(date, LTRIM(RTRIM(b.last_updated)), 23), TRY_CONVERT(date, LTRIM(RTRIM(b.last_updated)), 101),
           TRY_CONVERT(date, LTRIM(RTRIM(b.last_updated)), 107), TRY_CONVERT(date, LTRIM(RTRIM(b.last_updated)), 100), TRY_CONVERT(date, LTRIM(RTRIM(b.last_updated))),
           CASE WHEN LTRIM(RTRIM(b.last_updated)) NOT LIKE '%[^0-9]%' AND LEN(LTRIM(RTRIM(b.last_updated))) = 5
                     AND TRY_CAST(LTRIM(RTRIM(b.last_updated)) AS int) BETWEEN 40000 AND 50000
                THEN DATEADD(day, TRY_CAST(LTRIM(RTRIM(b.last_updated)) AS int), CAST('1899-12-30' AS date)) END) AS LastUpdated,
  CASE WHEN NULLIF(LTRIM(RTRIM(b.quote_amount)), '') IS NOT NULL
            AND LOWER(LTRIM(RTRIM(b.quote_amount))) NOT IN ('n/a','-','tbd') THEN 1 ELSE 0 END AS HasQuote
FROM [LeadPipelineLake].[dbo].[bronze_historical_leads] b;
GO

-- ---- Quarantine: rows we cannot place (unparseable created date or unrecognized stage) ----
DROP TABLE IF EXISTS silver.LeadQuarantine;
GO
CREATE TABLE silver.LeadQuarantine AS
SELECT * FROM silver.LeadStage
WHERE CreatedDate IS NULL OR Stage = 'unknown' OR CreatedDate > CAST(GETDATE() AS date);
GO

-- ---- Clean: valid rows, deduped (keep the most complete row per logical lead) ----
DROP TABLE IF EXISTS silver.LeadClean;
GO
CREATE TABLE silver.LeadClean AS
SELECT LeadId, CustomerName, Email, EstimatedValue, Stage, LeadSourceName, RepName, ProjectType,
       CreatedDate, ConsultDate, WonDate, LastUpdated, HasQuote
FROM (
  SELECT s.*,
         ROW_NUMBER() OVER (
           PARTITION BY s.NormName, s.ProjectType, s.CreatedDate
           ORDER BY CASE WHEN s.EstimatedValue IS NOT NULL THEN 0 ELSE 1 END,
                    CASE WHEN s.Email IS NOT NULL THEN 0 ELSE 1 END, s.LeadId
         ) AS rn
  FROM silver.LeadStage s
  WHERE s.CreatedDate IS NOT NULL AND s.Stage <> 'unknown' AND s.CreatedDate <= CAST(GETDATE() AS date)
) z
WHERE rn = 1;
GO

-- ---- Validation against ground truth ----
SELECT 'staged' AS step, COUNT(*) AS rows FROM silver.LeadStage
UNION ALL SELECT 'quarantine', COUNT(*) FROM silver.LeadQuarantine
UNION ALL SELECT 'clean (target 400)', COUNT(*) FROM silver.LeadClean;
GO
SELECT Stage, COUNT(*) AS n FROM silver.LeadClean GROUP BY Stage ORDER BY Stage;
GO
SELECT 'distinct reps' AS k, COUNT(DISTINCT RepName) AS n FROM silver.LeadClean
UNION ALL SELECT 'distinct sources', COUNT(DISTINCT LeadSourceName) FROM silver.LeadClean
UNION ALL SELECT 'distinct projects', COUNT(DISTINCT ProjectType) FROM silver.LeadClean;
GO
SELECT CASE WHEN CreatedDate IS NULL THEN 'null_created'
            WHEN Stage = 'unknown' THEN 'unknown_stage'
            WHEN CreatedDate > CAST(GETDATE() AS date) THEN 'future_created' ELSE 'other' END AS reason,
       COUNT(*) AS n
FROM silver.LeadQuarantine
GROUP BY CASE WHEN CreatedDate IS NULL THEN 'null_created'
              WHEN Stage = 'unknown' THEN 'unknown_stage'
              WHEN CreatedDate > CAST(GETDATE() AS date) THEN 'future_created' ELSE 'other' END;
GO
