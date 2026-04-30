<!--
name: top_technicians_by_volume
question: Who are the top technicians by ticket volume?
intent: Technician workload ranking
aliases:
  - top agents by ticket count
  - technician ranking by volume
  - busiest technicians
  - who handled the most tickets
  - technician performance by volume
when_to_use:
  - Use for questions ranking technicians by number of assigned tickets.
  - Use when the user asks for close rate or average resolution time per technician.
primary_group_by: technician__name
primary_metric: COUNT(*)
returns:
  - technician
  - total_tickets
  - closed_tickets
  - close_rate_pct
  - avg_resolution_hours
do_not_use_for:
  - group ranking
  - category distribution
  - status counts
tables_used: LLM_access_tickets
description: Shows top technicians from the filtered LLM_access_tickets view ranked by number of tickets assigned, with resolution rate and average resolution time
-->
SELECT
    technician__name AS technician,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN status__name = 'Closed' THEN 1 ELSE 0 END) AS closed_tickets,
    ROUND(SUM(CASE WHEN status__name = 'Closed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS close_rate_pct,
    ROUND(AVG(CASE WHEN time_elapsed_hours IS NOT NULL THEN time_elapsed_hours END), 2) AS avg_resolution_hours
FROM LLM_access_tickets
WHERE technician__name IS NOT NULL
GROUP BY technician__name
ORDER BY total_tickets DESC
LIMIT 20
