<!--
name: fcr_rate
question: What is the First Contact Resolution rate?
tables_used: prod_tickets_2025___tickets
description: Calculates First Contact Resolution (FCR) rate overall and by priority. FCR means the ticket was resolved on the first interaction.
-->
SELECT
    priority__name AS priority,
    COUNT(*) AS total_tickets,
    SUM(CASE WHEN is_fcr = true THEN 1 ELSE 0 END) AS fcr_tickets,
    ROUND(SUM(CASE WHEN is_fcr = true THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS fcr_rate_pct
FROM prod_tickets_2025___tickets
WHERE priority__name IS NOT NULL
GROUP BY priority__name
ORDER BY priority__name
