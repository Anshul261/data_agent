<!--
name: sla_compliance
question: What is the overall SLA compliance rate?
intent: SLA compliance by priority
aliases:
  - SLA breach rate
  - on time vs overdue tickets
  - overdue percentage by priority
  - SLA compliance percentage
  - resolution SLA adherence
when_to_use:
  - Use for questions about overdue tickets, on-time tickets, or SLA compliance percentages.
  - Use when the user asks how many tickets breached SLA by priority.
primary_group_by: priority__name
primary_metric: on_time_tickets / total_tickets
returns:
  - priority
  - total_tickets
  - overdue_tickets
  - on_time_tickets
  - sla_compliance_pct
do_not_use_for:
  - first contact resolution
  - average resolution hours
  - ticket count by priority
tables_used: LLM_access_tickets
description: Calculates SLA compliance from the filtered LLM_access_tickets view by comparing overdue vs on-time tickets, broken down by priority
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN is_overdue = true THEN 1 ELSE 0 END) AS overdue_tickets,
    SUM(CASE WHEN is_overdue = false OR is_overdue IS NULL THEN 1 ELSE 0 END) AS on_time_tickets,
    ROUND(SUM(CASE WHEN is_overdue = false OR is_overdue IS NULL THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS sla_compliance_pct
FROM LLM_access_tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
