<!--
name: top_technicians_by_volume
question: Who are the top technicians by ticket volume?
tables_used: prod_tickets_2025___tickets
description: Shows top technicians ranked by number of tickets assigned, with resolution rate and average resolution time
-->
SELECT
    technician__name AS technician,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN status__name = 'Closed' THEN 1 ELSE 0 END) AS closed_tickets,
    ROUND(SUM(CASE WHEN status__name = 'Closed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS close_rate_pct,
    ROUND(AVG(CASE WHEN time_elapsed_hours IS NOT NULL THEN time_elapsed_hours END), 2) AS avg_resolution_hours
FROM prod_tickets_2025___tickets
WHERE technician__name IS NOT NULL
GROUP BY technician__name
ORDER BY total_tickets DESC
LIMIT 20
