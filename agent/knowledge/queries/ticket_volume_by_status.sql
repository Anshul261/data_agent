<!--
name: ticket_volume_by_status
question: How many tickets are in each status?
tables_used: prod_tickets_2025___tickets
description: Counts tickets grouped by their current status name, ordered by volume descending
-->
SELECT
    status__name AS status,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM prod_tickets_2025___tickets), 2) AS percentage
FROM prod_tickets_2025___tickets
WHERE status__name IS NOT NULL
GROUP BY status__name
ORDER BY ticket_count DESC
