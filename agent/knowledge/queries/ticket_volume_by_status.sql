<!--
name: ticket_volume_by_status
question: How many tickets are in each status?
intent: Ticket count by current status
aliases:
  - status distribution
  - count tickets by status
  - number of open closed assigned tickets
  - tickets grouped by current status
  - status breakdown
when_to_use:
  - Use for questions asking how many tickets exist in each status bucket.
  - Use for open, closed, assigned, in progress, waiting status counts.
primary_group_by: status__name
primary_metric: COUNT(*)
returns:
  - status
  - ticket_count
  - percentage
do_not_use_for:
  - priority distribution
  - technician ranking
  - monthly trend
tables_used: LLM_access_tickets
description: Counts tickets from the filtered LLM_access_tickets view grouped by their current status name, ordered by volume descending
-->
SELECT
    status__name AS status,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM LLM_access_tickets), 2) AS percentage
FROM LLM_access_tickets
WHERE status__name IS NOT NULL
GROUP BY status__name
ORDER BY ticket_count DESC
