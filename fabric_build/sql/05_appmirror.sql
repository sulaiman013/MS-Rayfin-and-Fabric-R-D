-- Can the Warehouse read the live app's mirrored tables cross-database?
-- List the app SQL database tables, then count live leads.
SELECT TABLE_SCHEMA, TABLE_NAME
FROM [lead-pipeline-app].INFORMATION_SCHEMA.TABLES
ORDER BY TABLE_SCHEMA, TABLE_NAME;
