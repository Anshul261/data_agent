<!--
name: fcr_rate
question: What is the First Contact Resolution rate?
intent: FCR rate by priority
aliases:
  - first contact resolution
  - FCR percentage
  - one touch resolution rate
  - resolved on first interaction rate
  - first response resolution rate
when_to_use:
  - Use for questions about First Contact Resolution overall or by priority.
  - Use when the user asks what percent of tickets were resolved on first contact.
primary_group_by: priority__name
primary_metric: SUM(is_fcr=true) / COUNT(*)
returns:
  - priority
  - total_tickets
  - fcr_tickets
  - fcr_rate_pct
do_not_use_for:
  - SLA overdue rate
  - average resolution hours
  - monthly ticket trend
tables_used: LLM_access_tickets
description: Calculates First Contact Resolution (FCR) rate overall and by priority using the filtered LLM_access_tickets view. FCR means the ticket was resolved on the first interaction.
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN is_fcr = true THEN 1 ELSE 0 END) AS fcr_tickets,
    ROUND(SUM(CASE WHEN is_fcr = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS fcr_rate_pct
FROM LLM_access_tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
