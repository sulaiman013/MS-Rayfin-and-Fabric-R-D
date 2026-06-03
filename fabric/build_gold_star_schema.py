# =====================================================================
# Lead-to-Install Pipeline: build the GOLD star schema
# Run in a Fabric PySpark notebook attached to your GOLD lakehouse
# (for example LeadPipelineGold).
#
# Source = the five operational tables mirrored from the Fabric SQL
# database into OneLake, added to this lakehouse as OneLake shortcuts:
#   Rep, LeadSource, Lead, StageEvent, Quote
#
# Output = DimRep, DimLeadSource, DimStage, DimDate,
#          FactLead, FactStageEvent, FactQuote
# Paste and run each cell in order.
# =====================================================================

# ---- Cell 1: imports and config -------------------------------------
from pyspark.sql import functions as F, Window

# The names of the shortcut tables as they appear in this lakehouse.
BRONZE = {
    "rep":        "Rep",
    "leadsource": "LeadSource",
    "lead":       "Lead",
    "stageevent": "StageEvent",
    "quote":      "Quote",
}

def read_bronze(key):
    return spark.read.table(BRONZE[key])

# ---- Cell 2: DimRep --------------------------------------------------
dim_rep = (
    read_bronze("rep")
    .select(
        F.col("id").alias("RepId"),
        F.col("name").alias("RepName"),
        F.col("email").alias("Email"),
        F.col("showroom").alias("Showroom"),
        F.col("active").alias("IsActive"),
    )
    .withColumn("RepKey", F.row_number().over(Window.orderBy("RepId")))
)
dim_rep.write.mode("overwrite").format("delta").saveAsTable("DimRep")

# ---- Cell 3: DimLeadSource ------------------------------------------
dim_source = (
    read_bronze("leadsource")
    .select(
        F.col("id").alias("LeadSourceId"),
        F.col("name").alias("LeadSourceName"),
        F.col("channel").alias("Channel"),
    )
    .withColumn("LeadSourceKey", F.row_number().over(Window.orderBy("LeadSourceId")))
)
dim_source.write.mode("overwrite").format("delta").saveAsTable("DimLeadSource")

# ---- Cell 4: DimStage (conformed, fixed funnel order) ---------------
stages = [("new", 1), ("consult", 2), ("quote", 3), ("won", 4), ("lost", 5)]
dim_stage = (
    spark.createDataFrame(stages, ["StageName", "StageOrder"])
    .withColumn("StageKey", F.col("StageOrder"))
)
dim_stage.write.mode("overwrite").format("delta").saveAsTable("DimStage")

# ---- Cell 5: DimDate -------------------------------------------------
DATE_MIN, DATE_MAX = "2024-01-01", "2027-12-31"
dim_date = (
    spark.sql(f"SELECT explode(sequence(to_date('{DATE_MIN}'), to_date('{DATE_MAX}'), interval 1 day)) AS Date")
    .withColumn("DateKey", F.date_format("Date", "yyyyMMdd").cast("int"))
    .withColumn("Year", F.year("Date"))
    .withColumn("Quarter", F.concat(F.lit("Q"), F.quarter("Date")))
    .withColumn("MonthNumber", F.month("Date"))
    .withColumn("MonthName", F.date_format("Date", "MMMM"))
    .withColumn("YearMonth", F.date_format("Date", "yyyy-MM"))
    .withColumn("DayOfWeek", F.date_format("Date", "EEEE"))
    .withColumn("IsWeekend", F.dayofweek("Date").isin(1, 7))
)
dim_date.write.mode("overwrite").format("delta").saveAsTable("DimDate")

# ---- Cell 6: FactLead (grain = one lead) ----------------------------
fact_lead = (
    read_bronze("lead")
    .withColumn("CreatedDateKey", F.date_format("createdAt", "yyyyMMdd").cast("int"))
    .withColumn("IsWon", (F.col("stage") == "won").cast("int"))
    .withColumn("IsLost", (F.col("stage") == "lost").cast("int"))
    .join(dim_rep.select("RepId", "RepKey"), F.col("rep_id") == F.col("RepId"), "left")
    .join(dim_source.select("LeadSourceId", "LeadSourceKey"), F.col("leadSource_id") == F.col("LeadSourceId"), "left")
    .join(dim_stage.select("StageName", F.col("StageKey").alias("CurrentStageKey")), F.col("stage") == F.col("StageName"), "left")
    .select(
        F.col("id").alias("LeadId"),
        "RepKey", "LeadSourceKey", "CreatedDateKey", "CurrentStageKey",
        F.col("projectType").alias("ProjectType"),
        F.col("estimatedValue").cast("decimal(12,2)").alias("EstimatedValue"),
        "IsWon", "IsLost",
    )
)
fact_lead.write.mode("overwrite").format("delta").saveAsTable("FactLead")

# ---- Cell 7: FactStageEvent (grain = one transition, with time-in-stage)
lead_keys = read_bronze("lead").select(
    F.col("id").alias("LeadId"), "rep_id", "leadSource_id"
)
w = Window.partitionBy("lead_id").orderBy("enteredAt")
fact_stage = (
    read_bronze("stageevent")
    .withColumn("NextEnteredAt", F.lead("enteredAt").over(w))
    .withColumn(
        "DurationDays",
        F.when(F.col("NextEnteredAt").isNotNull(), F.datediff(F.col("NextEnteredAt"), F.col("enteredAt"))),
    )
    .withColumn("EnteredDateKey", F.date_format("enteredAt", "yyyyMMdd").cast("int"))
    .join(dim_stage.select("StageName", "StageKey"), F.col("stage") == F.col("StageName"), "left")
    .join(lead_keys, F.col("lead_id") == F.col("LeadId"), "left")
    .join(dim_rep.select("RepId", "RepKey"), F.col("rep_id") == F.col("RepId"), "left")
    .join(dim_source.select("LeadSourceId", "LeadSourceKey"), F.col("leadSource_id") == F.col("LeadSourceId"), "left")
    .select(
        F.col("id").alias("StageEventId"),
        F.col("lead_id").alias("LeadId"),
        "StageKey", "RepKey", "LeadSourceKey", "EnteredDateKey",
        F.col("enteredAt").alias("EnteredAt"),
        "DurationDays",
    )
)
fact_stage.write.mode("overwrite").format("delta").saveAsTable("FactStageEvent")

# ---- Cell 8: FactQuote (grain = one quote) --------------------------
fact_quote = (
    read_bronze("quote")
    .withColumn("IssuedDateKey", F.date_format("issuedAt", "yyyyMMdd").cast("int"))
    .withColumn(
        "ResponseDays",
        F.when(F.col("respondedAt").isNotNull(), F.datediff(F.col("respondedAt"), F.col("issuedAt"))),
    )
    .withColumn("IsAccepted", (F.col("status") == "accepted").cast("int"))
    .join(lead_keys, F.col("lead_id") == F.col("LeadId"), "left")
    .join(dim_rep.select("RepId", "RepKey"), F.col("rep_id") == F.col("RepId"), "left")
    .join(dim_source.select("LeadSourceId", "LeadSourceKey"), F.col("leadSource_id") == F.col("LeadSourceId"), "left")
    .select(
        F.col("id").alias("QuoteId"),
        F.col("lead_id").alias("LeadId"),
        "RepKey", "LeadSourceKey", "IssuedDateKey",
        F.col("amount").cast("decimal(12,2)").alias("Amount"),
        F.col("status").alias("Status"),
        "IsAccepted", "ResponseDays",
    )
)
fact_quote.write.mode("overwrite").format("delta").saveAsTable("FactQuote")

print("Gold star schema built: DimRep, DimLeadSource, DimStage, DimDate, FactLead, FactStageEvent, FactQuote")
