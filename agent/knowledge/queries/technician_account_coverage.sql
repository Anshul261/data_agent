<!--
name: technician_account_coverage
question: Which technicians are assigned to which customer accounts?
tables_used: technician_customer_assignments
description: Shows technician-to-customer mappings with contract dates and key services
-->
SELECT
    technician_db_name AS technician,
    account_db_name AS customer_account,
    key_services,
    contract_start_date,
    contract_end_date,
    CASE
        WHEN contract_end_date IS NULL OR contract_end_date >= today() THEN 'Active'
        ELSE 'Expired'
    END AS contract_status
FROM technician_customer_assignments
ORDER BY technician_db_name, account_db_name
