<!--
name: ticket_volume_by_priority
question: How many tickets are there for each priority level?
intent: Count tickets by priority
aliases:
  - ticket count by priority
  - number of tickets for each priority
  - tickets grouped by priority
  - count of P1 P2 P3 P4 tickets
  - priority distribution
when_to_use:
  - Use for questions asking how many tickets exist in each priority bucket.
  - Use for P1 P2 P3 P4 volume breakdowns.
  - Use when the user asks for priority counts rather than resolution time or SLA.
primary_group_by: priority__name
primary_metric: COUNT(*)
returns:
  - priority
  - ticket_count
  - percentage
do_not_use_for:
  - average resolution time by priority
  - SLA compliance by priority
  - first contact resolution rate
tables_used: LLM_access_tickets
description: Counts tickets from the filtered LLM_access_tickets view grouped by priority (P1-P4), ordered by volume descending
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM LLM_access_tickets), 2) AS percentage
FROM LLM_access_tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY ticket_count DESC
