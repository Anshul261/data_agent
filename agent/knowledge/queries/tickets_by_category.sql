<!--
name: tickets_by_category
question: How are tickets distributed across categories?
intent: Ticket count by category
aliases:
  - category distribution
  - tickets per category
  - ticket volume by category
  - how many tickets in each category
  - category breakdown
when_to_use:
  - Use for questions about category mix or category contribution to ticket volume.
primary_group_by: category__name
primary_metric: COUNT(*)
returns:
  - category
  - ticket_count
  - percentage
do_not_use_for:
  - subcategory deep dive
  - monthly trend
  - priority counts
tables_used: LLM_access_tickets
description: Shows ticket volume by category from the filtered LLM_access_tickets view with percentage breakdown
-->
SELECT
    category__name AS category,
    COUNT(*) AS ticket_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM LLM_access_tickets WHERE category__name IS NOT NULL), 2) AS percentage
FROM LLM_access_tickets
WHERE category__name IS NOT NULL
GROUP BY category__name
ORDER BY ticket_count DESC
