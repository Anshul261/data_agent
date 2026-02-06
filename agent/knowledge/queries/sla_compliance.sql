<!--
name: sla_compliance
question: What is the overall SLA compliance rate?
tables_used: prod_tickets_2025___tickets
description: Calculates SLA compliance by comparing overdue vs on-time tickets, broken down by priority
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN is_overdue = true THEN 1 ELSE 0 END) AS overdue_tickets,
    SUM(CASE WHEN is_overdue = false OR is_overdue IS NULL THEN 1 ELSE 0 END) AS on_time_tickets,
    ROUND(SUM(CASE WHEN is_overdue = false OR is_overdue IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS sla_compliance_pct
FROM prod_tickets_2025___tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
