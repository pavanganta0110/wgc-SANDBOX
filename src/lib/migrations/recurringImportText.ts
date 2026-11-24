/** Text the screens and the server share. No Node imports here, so a browser component can use it. */

/** What the staff member confirms before a recurring import is created; saved on the job. */
export const ATTESTATION_TEXT =
  "I confirm the merchant has the donors' permission to continue these recurring gifts (including written authorization for bank account debits), that the merchant has asked for them to be moved, and that the previous platform's schedules will be stopped before the first WGC charge.";

/** The sample the merchant or staff can download: the shape of the schedule file. */
export const SCHEDULE_TEMPLATE_CSV = [
  "external_customer_id,original_token_id,donor_name,donor_email,amount,frequency,next_charge_date,fund,start_date,consent_date",
  "CTG-1001,tok_aaa111,Jordan Ellis,jordan@example.com,25.00,monthly,2027-01-05,General Fund,2024-03-05,2024-03-05",
  "CTG-1002,tok_bbb222,Taylor Brooks,taylor@example.com,100.00,monthly,2027-01-15,Missions,2023-08-15,2023-08-15",
  "CTG-1003,tok_ccc333,Sam Rivera,sam@example.com,50.00,weekly,2027-01-07,General Fund,2025-01-02,2025-01-02",
].join("\n");

/** The shape of the file Finix sends back after it imports the cards (per Finix's migration guide). */
export const MAPPING_TEMPLATE_CSV = [
  "import_reference_number,finix_instrument_id,finix_identity_id,finix_application_id,successful,external_customer_id,external_token_id,customer_email,instrument_last_four,card_brand,expiration_month,expiration_year,error_msg,is_expired",
  "REF001,PIxxxxxxxxxxxxxxxxxxxxxx,IDxxxxxxxxxxxxxxxxxxxxxx,APxxxxxxxxxxxxxxxxxxxxxx,true,CTG-1001,tok_aaa111,jordan@example.com,4444,VISA,12,2030,,false",
].join("\n");
