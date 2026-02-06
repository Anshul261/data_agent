<!--
name: ticket_volume_by_priority
question: How many tickets are there for each priority level?
tables_used: prod_tickets_2025___tickets
description: Counts tickets grouped by priority (P1-P4), ordered by volume descending
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM prod_tickets_2025___tickets), 2) AS percentage
FROM prod_tickets_2025___tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY ticket_count DESC
