<!--
name: tickets_by_category
question: How are tickets distributed across categories?
tables_used: prod_tickets_2025___tickets
description: Shows ticket volume by category with percentage breakdown
-->
SELECT
    category__name AS category,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM prod_tickets_2025___tickets WHERE category__name IS NOT NULL), 2) AS percentage
FROM prod_tickets_2025___tickets
WHERE category__name IS NOT NULL
GROUP BY category__name
ORDER BY ticket_count DESC
