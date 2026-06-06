-- Connectivity + cross-database read test: Warehouse reading the Lakehouse bronze.
SELECT COUNT(*) AS bronze_rows FROM [LeadPipelineLake].[dbo].[bronze_historical_leads];
GO
SELECT TOP 3 lead_id_legacy, Stage, Source, Estimated_Value, created
FROM [LeadPipelineLake].[dbo].[bronze_historical_leads];
