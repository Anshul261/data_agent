<!--
name: avg_resolution_time_by_priority
question: What is the average resolution time for tickets by priority?
intent: Resolution speed by priority
aliases:
  - mean resolution time by priority
  - average hours to resolve by priority
  - resolution duration by P1 P2 P3 P4
  - median resolution time by priority
when_to_use:
  - Use for questions about how long tickets take to resolve by priority.
  - Use when the user asks for average, median, min, or max resolution hours.
primary_group_by: priority__name
primary_metric: AVG(time_elapsed_hours)
returns:
  - priority
  - resolved_tickets
  - avg_resolution_hours
  - min_hours
  - max_hours
  - median_hours
do_not_use_for:
  - priority ticket counts
  - SLA compliance percentage
  - status distribution
tables_used: LLM_access_tickets
description: Calculates average resolution time in hours using time_elapsed_hours from the filtered LLM_access_tickets view, grouped by priority. Only includes tickets that have been resolved.
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS resolved_tickets,
    ROUND(AVG(time_elapsed_hours), 2) AS avg_resolution_hours,
    ROUND(MIN(time_elapsed_hours), 2) AS min_hours,
    ROUND(MAX(time_elapsed_hours), 2) AS max_hours,
    ROUND(quantile(0.5)(time_elapsed_hours), 2) AS median_hours
FROM LLM_access_tickets
WHERE resolved_time_ts IS NOT NULL
  AND time_elapsed_hours IS NOT NULL
  AND priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
