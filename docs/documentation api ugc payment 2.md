UNICORNPAYMENT – BUSINESS
PRO/DIRECTSALE
TABLE OF CONTENTS
Revision History ............................................................................................................................................................ 2
Overview ...................................................................................................................................................................... 2
What is DirectSale .................................................................................................................................................... 2
Required information ............................................................................................................................................... 2
Software Requirements ........................................................................................................................................... 3
DirectSale Payment Url End-Point ................................................................................................................................ 3
HTTP Request ............................................................................................................................................................... 3
Transaction Types ......................................................................................................................................................... 3
Authorize Transactions ............................................................................................................................................ 3
Sale Transactions ...................................................................................................................................................... 3
Capture Transactions .............................................................................................................................................. 7
Refund Transactions ................................................................................................................................................. 8
Void Transactions ..................................................................................................................................................... 9
Recurring/rebill Transactions ................................................................................................................................. 10
HTTP Response ........................................................................................................................................................... 12
Confirm page .......................................................................................................................................................... 13
Appendix A – Transaction State Types ....................................................................................................................... 14
Appendix B – Transaction Status Types ...................................................................................................................... 15
Appendix C – Validation errors ................................................................................................................................... 15
DirectSale 1
Appendix D – Scrub Messages .................................................................................................................................... 18
Appendix e – Error message ....................................................................................................................................... 18
Appendix F – decline message .................................................................................................................................... 21
REVISION HISTORY
Date Revision Description Author
1/21/2020 1.11 First Version UnicornGroup
8/28/2020 1.12 Fixed Links UnicornGroup
12/3/2022 1.13 Added ConfirmURL UnicornGroup
5/17/2024 1.14 Cleaned up formatting UnicornGroup
OVERVIEW
WHAT IS DIRECTSALE
The UnicornPayment DirectSale Payment API can process your customer’s online purchases without redirection to
our hosted payment page(s).
The API adheres to REST architectural constraints. The API’s are designed to have predictable, resource-oriented
URLs and to use HTTP response codes to indicate API errors.
REQUIRED INFORMATION
Before you will be able to submit transactions to UnicornPayment, you will need an UnicornPayment merchant
account for your website. Once you have a merchant account established, UnicornPayment will supply you with:
1. Merchant Id
2. Site Id
3. OAuth Bearer Token
These IDs uniquely identify your websites, customers, and payments.
DirectSale 2
SOFTWARE REQUIREMENTS
To implement the JSON interface for standard card processing, the following requirements must be met:
• Working knowledge of JSON
• SSL server supporting 128-bit (or stronger) encryption
DIRECTSALE PAYMENT URL END-POINT
The API URL to submit your transaction for payment is defined as follows:
https://api.ugpayments.ch/merchants/[MerchantId]/<Transaction Type>
[Merchant ID] – Replace this value with the merchant id assigned by UnicornPayment
<Transaction Type> – Replace this value with the type of transaction
• AuthorizeTransactions
• SaleTransactions
• CaptureTransactions
• VoidTransactions
• RefundTransactions
HTTP REQUEST
Requests are submitted to the API via HTTP Post. The request should contain the following header settings:
Content-type: application/json
Authorization: Bearer <OAuth Bearer Token>
The JSON string is added to the body of the request.
TRANSACTION TYPES
AUTHORIZE TRANSACTIONS
URL: https://api.ugpayments.ch/merchants/[MerchantId]/authorizetransactions
Authorize transactions can be initiated using the same JSON string value pairs as the Sale Transaction API. difference is transaction type passed in the URL.
The only
SALE TRANSACTIONS
DirectSale 3
URL: https://api.ugpayments.ch/merchants/[MerchantId]/saletransactions
JSON REQUEST PARAMETERS
Parameter Name Description Example
siteId Site ID assigned by UnicornPayment
string, mandatory
12
amount Amount of the transaction
Decimal, mandatory
123.45
currency Transaction currency, in ISO 4217
format.
3 character, mandatory
USD
firstName Cardholder’s first name
50 character max, mandatory
John
lastName Cardholder’s last name
50 character max, mandatory
Doe
phone Cardholder’s phone
20 character max, optional
555-555-5555
addressLine1 Billing address
100 character max, optional
123 Fake St.
addressLine2 Billing address
100 character max, optional
Suite # 789
city Billing address city
50 character max, optional
Hollywood
state Billing state
50 character max, optional
California
countryId Billing country
2 character, mandatory
US
postalCode Billing postal code
20 character max, optional
90046
shippingFirstName Shipping to first name
50 character max, optional
shippingLastName Shipping last name
50 character max, optional
shippingPhone Cardholder’s phone
20 character max, optional
shippingAddressLine1 Shipping address
100 character max, optional
shippingAddressLine2 Shipping address
100 character max, optional
shippingCity Shipping address city
50 character max, optional
shippingState Shipping state
50 character max, optional
shippingCountryId Shipping country
2 character, optional
shippingPostalCode Shipping postal code
20 character max, optional
DirectSale 4
email Cardholder’s email address
100 character max, optional
<identifier>@<domain>.<extension>
cardNumber Credit card number
Integer, mandatory
4242424242424242
nameOnCard Cardholder’s name printed on card
40 character max, mandatory
John J. Doe
expirationMonth Integer, mandatory 9
expirationYear Integer, mandatory 2018
cVVCode 4 character max, mandatory 469
iPAddress Cardholder’s IP Address
20 character max, optional
127.0.0.1
trackingId Merchant
100 character max, optional
123456
isInitialForRecurring Indicates if the transaction is the
initial recurring transaction
Boolean, mandatory
true or false
ConfirmURL Merchant’s URL that can receive a
postback/callback
https://www.merchanturl.com/postback.php
JSON RESPONSE PARAMETERS
Parameter Name Description Example
State String, state of transaction, example
Sale, Auth, Refund
Sale
Status String, Status of transaction Approved
message String, message regarding the
transaction
The operation was successfully processed.
trackingId String, passed from request YourID
id String, transactionID from
UnicornPayment
transactionID
reasonCode String, Response From bank ONLY if
transaction reached bank.
00 - Approved
HTTP REQUEST EXAMPLE
DirectSale 5
{
"siteId": "12",
"currency": "USD",
"firstName": "John",
"lastName": "Doe",
"phone": "555-555-5555",
"city": "Hollywood",
"state": "California",
"countryId": "US",
"postalCode": "90046",
"shippingFirstName": "",
"shippingLastName": "",
"shippingPhone": "",
"addressLine1": "",
"addressLine2": "",
"shippingAddressLine1": "",
"shippingAddressLine2": "",
"shippingCity": "sample string 18",
"shippingState": "sample string 19",
"shippingCountryId": "",
"shippingPostalCode": "",
"email": "<email address>",
"cardNumber": 4242424242424242,
"nameOnCard": "John Doe",
"expirationMonth": 09,
"expirationYear": 2018,
"cvvCode": "469",
"ipAddress": "127.0.0.1",
"trackingId": "123456",
"amount": 123.45,
"isInitialForRecurring": false,
"ConfirmURL": "https://www.merchanturl.com/post.php"
}
HTTP RESPONSE EXAMPLE
{
"id": "123456",
"message": "Success",
"state": "Sale",
"status": "Successful"
"trackingid": "123456"
"reasoncode": "00-approved"
}
OR
{
"id": "123456",
"message": "Success",
"state": "Authorize",
"status": "Successful"
"trackingid": "123456"
"reasoncode": "00-approved"
DirectSale 6
}
CAPTURE TRANSACTIONS
URL: https://api.ugpayments.ch/merchants/[MerchantId]/capturetransactions
Only authorize transactions that have not been voided can be captured.
JSON REQUEST PARAMETERS
Parameter Name Description Example
authorizetransactionid The transaction id return by the
Authorization
String, mandatory
123456
amount Amount of the transaction
Decimal/Number, mandatory
123.45
JSON RESPONSE PARAMETERS
Parameter Name Description Example
State String, state of transaction, example
Sale, Auth, Refund
Sale
Status String, Status of transaction Approved
message String, message regarding the
transaction
The operation was successfully processed.
trackingId String, passed from request YourID
id String, transactionID from
UnicornPayment
transactionID
reasonCode String, Response From bank ONLY if
transaction reached bank.
00 - Approved
DirectSale 7
HTTP REQUEST EXAMPLE
{
}
"authorizeTransactionId": "123456",
"amount": 123.45
HTTP RESPONSE EXAMPLE
{
"id": "123456",
"message": "Success",
"state": "Capture",
"status": "Successful"
"reasoncode": "00-approved"
}
REFUND TRANSACTIONS
URL: https://api.ugpayments.ch/merchants/[MerchantId]/refundtransactions
Only sale and capture transactions can be refunded.
JSON REQUEST PARAMETERS
Parameter Name Description Example
referencetransactionid The transaction id returned by the sale
transaction or the capture transaction.
String, mandatory
123456
amount The amount to refund, not to exceed
original transaction amount.
Decimal/Number, mandatory
123.45
JSON RESPONSE PARAMETERS
Parameter Name Description Example
State String, state of transaction, example
Sale, Auth, Refund
Sale
Status String, Status of transaction Approved
message String, message regarding the
transaction
The operation was successfully processed.
trackingId String, passed from request YourID
id String, transactionID from
UnicornPayment
transactionID
DirectSale 8
reasonCode String, Response From bank ONLY if
transaction reached bank.
00 - Approved
HTTP REQUEST EXAMPLE
{
"referenceTransactionId": "123456",
"amount": 123.45
}
HTTP RESPONSE EXAMPLE
{
"id": "123456",
"message": "Success",
"state": "Refund",
"status": "Successful"
"reasoncode": "00-approved"
}
VOID TRANSACTIONS
URL: https://api.ugpayments.ch/merchants/[MerchantId]/voidtransactions
Only authorize transaction can be voided.
JSON REQUEST PARAMETERS
Parameter Name Description Example
authorizeTransactionid The transaction id returned by the
authorization.
String, mandatory
123456
JSON RESPONSE PARAMETERS
DirectSale 9
Parameter Name Description Example
State String, state of transaction, example
Sale, Auth, Refund
Sale
Status String, Status of transaction Approved
message String, message regarding the
transaction
The operation was successfully processed.
trackingId String, passed from request YourID
id String, transactionID from
UnicornPayment
transactionID
reasonCode String, Response From bank ONLY if
transaction reached bank.
00 - Approved
HTTP REQUEST EXAMPLE
{
}
"authorizeTransactionId": "123456"
HTTP RESPONSE EXAMPLE
{
"id": "123457",
"message": "Success",
"state": "Void",
"status": "Successful"
"reasoncode": "00-approved"
}
RECURRING/REBILL TRANSACTIONS
There is two ways to process recurring transactions.
If you want to send the rebill transaction from your system, use the following:
URL: https://api.ugpayments.ch/merchants/[MerchantId]/recurringtransactions
Only previously successful transactions can be recurred.
JSON REQUEST PARAMETERS
Parameter Name Description Example
referenceTransactionId The transaction id returned by the
authorization.
123456
DirectSale 10
String, mandatory
saleTransactionId The transaction id returned by the
authorization.
String, mandatory
123456
Amount Amount to be charged.
Decimal Number, mandatory
1200.00
trackingId String, passed from request YourID
HTTP REQUEST EXAMPLE
{
"referenceTransactionId": "123456",
“saleTransactionId": "123456",
“amount”: 3.0,
“trackingId”; samplestring
}
HTTP RESPONSE EXAMPLE
{
"id": "123457",
"message": "Success",
"state": "Void",
"status": "Successful"
"reasoncode": "00-approved"
}
If you wish for our system to automatically process the rebills, please provide UnicornPayment with your amount,
and time of rebill. For example, 29.99/monthly.
You then would use the following sale call, and make sure you include the following parameters:
Parameter Name Description Example
Amount If you wish to charge a ONE TIME
charge WITH the subscription plan,
pass the amount. If you wish to ONLY
charge the subscription plan amount,
pass that amount, then customer will
be charged the amount PLUS the
subscription plan. For Example, you
15.00
DirectSale 11
wish to charge 15.00 setup fee along
with a subscription plan of
20/monthly, if you pass amount of
15.00, customer will be charged 35.00,
and next month 20.
SubscriptionPlanId Subscription Plan ID assigned by
UnicornPayment
string, mandatory
12119
isInitialForRecurring Indicates if the transaction is the initial
recurring transaction
Boolean, mandatory
true or false
Username Username of the customer myusername
Password Password of the customer mypassword
HTTP RESPONSE
The result is in JSON format with the following elements:
Parameter Name Description Example
id The id of the transaction 123456
message Error specific details
description Additional error information
state The type of transaction.
See appendix A.
Sale
Reasoncode Response from bank 00-approved
status The transaction status
See appendix B.
Successful
PLEASE NOTE, if there is any validation errors, our system will send back in message field “Validation errors”.
There will be NO status or description returned. If this is the case, the system will return a collection of Validation
Errors in the following format:
propertyName
errorMessage
attemptedValue
An example Validation error response:
message : Validation errors
date : 6/28/2017 16:12:58
requestURL : https://api.ugpayments.ch/Merchants/3/saletransactions
DirectSale 12
validationErrors : Array
array(4) { ["message"]=> string(17) "Validation errors" ["date"]=> string(18) "6/28/2017
16:12:58" ["requestURL"]=> string(57)
"https://api.ugpayments.ch/Merchants/3/saletransactions" ["validationErrors"]=> array(1) {
[0]=> array(3) { ["propertyName"]=> string(9) "CountryId" ["errorMessage"]=> string(26)
"'Country Id' is not valid." ["attemptedValue"]=> string(13) "United States" } }
For all possible Validation Errors, see Appendix C – Validation errors.
If Status response is Scrubbed, message will be populated from Appendix D – Scrub Messages.
If Status response is Error, message will be populated from Appendix E – Error Message.
CONFIRM PAGE
When a customer has successfully completed a transaction, UnicornPayment will send an HTTP POST with the
transaction details back to a designated page on your site. This page should validate and store the transaction
information in your database. The confirm page provides communication between UnicornPayment and your
application and does not need to provide user functionality.
Information is posted to the confirm page as standard HTTP POST name-value pairs (NVP) separated by
ampersands (&). An example confirm post would be:
Amount=17.99&MerchantReference=abc123&PayReferenceID=b9ab260b-d690-
4507-8d56-8bd92c4c132a&TransactionID=4cfdefc3-6ad2-49de-a25b-
5d0f41e8cd1a
The following fields are transmitted by UnicornPayment in a transaction to the ConfirmURL specified by you:
[TrackingId] => Reference Number for the Merchant’s Records (Limit 100 characters)
[MerchantReference] => Reference Number for the Merchant’s Records (Limit 100 characters)
[CurrencyID] => ISO Currency Code
[Key] => key supplied from portal from UnicornPayment
[Amount] => Amount of Transaction (Money/Numeric/Decimal)
[TransactionID] => Identity Number for the Transaction (Numeric)
DirectSale 13
[CardMask] => Characters used to mask the card number
[TransactionState] => State of Transaction (Appendix A)
[TransactionStatus] => State of Transaction (Appendix B)
[ShippingFirstName] => First Name for Shipping Address (Limit 50 characters)
[ShippingLastName] => Last Name for Shipping Address (Limit 50 characters)
[ShippingAddress1] => Address Line 1 for Shipping Address (Limit 100 characters)
[ShippingAddress2] => Address Line 2 for Shipping Address (Limit 100 characters)
[ShippingCity] => City for Shipping Address (Limit 50 characters)
[ShippingState] => State for Shipping Address (Limit 50 characters)
[ShippingCountry] => Country for Shipping Address
[ShippingPostalCode] => Postal Code for Shipping Address (Limit 20 characters)
[CustomerEmail] => mailto:mail@mail.com Email for the Customer (Limit 50 characters)
[CustomerFirstName] => First Name of Customer (Limit 50 characters)
[CustomerLastName] => Last name of Customer (Limit 50 characters)
[CustomerAddress1] => Address Line 1 for Customer Address (Limit 100 characters)
[CustomerAddress2] => Address Line 2 for Customer Address (Limit 100 characters)
[CustomerCity] => City for Customer Address (Limit 50 characters)
[CustomerState] => State for Customer Address (Limit 50 characters)
[CustomerCountry] => Country for Customer Address
[CustomerPostalCode] => Postal Code for Customer Address (Limit 20 characters)
[CustomerPhone] => Customer’s Phone (Limit 20 characters)
[SiteID] => Site Id for the Merchant’s Site (Numeric)
APPENDIX A – TRANSACTION STATE TYPES
Sale
DirectSale 14
Authorize
Capture
Void
Refund
APPENDIX B – TRANSACTION STATUS TYPES
Successful – payment successful
Error – timeout from either issuer or card network
Declined – declined from issuer
Pending – timeout from either issuer or card network
Scrubbed – internal fraud check from UnicornPayment, to include valid expiry, cc number, velocity checks
Fraud – flagged as a fraudulent transaction
Unconfirmed – system error
APPENDIX C – VALIDATION ERRORS
ACS Verification Id is required when supplying ECI or XID.
Address Line1' can not contain a credit card number.
Address Line1' must be between 0 and 100 characters. You entered <char> characters.
Address Line1' must be between 1 and 100 characters.
Address Line2' can not contain a credit card number.
Address Line2' must be between 0 and 100 characters. You entered <char> characters.
Address Line2' must be between 1 and 100 characters.
Amount' must be greater than '0'.
Amount' must be greater than or equal to '0'.
Authorize Transaction Id' is not valid.
Bank Identifier' should not be empty.
Card Number' is not valid.
City' can not contain a credit card number.
City' must be between 0 and 50 characters. You entered <char> characters.
DirectSale 15
City' must be between 1 and 50 characters
Country Id' is not valid.
Country Id' must be not be empty.
'Currency' can not contain a credit card number.
Currency' is not valid.
'CVV code' is not valid.
ECI is required when supplying ACS Verification Id or XID.
Email' must be between 0 and 100 characters. You entered <char> characters.
Email' must be between 1 and 100 characters. You entered <char> characters.
Email' should not be empty.
Email' can not contain a credit card number.
Expiration date' is not valid.
First Name' can not contain a credit card number.
First Name' must be between 1 and 50 characters. You entered <char> characters.
First Name' should not be empty.
IP Address' can not contain a credit card number.
IP Address' must be between 0 and 20 characters. You entered <char> characters.
Last Name' can not contain a credit card number.
Last Name' must be between 1 and 50 characters. You entered <char> characters.
Last Name' should not be empty.
Merchant Referrer Url' must be between 0 and 100 characters. You entered <char> characters.
Name On Card' can not contain a credit card number.
Phone' must be between 0 and 20 characters. You entered <char> characters.
Phone' must be between 1 and 20 characters. You entered <char> characters.
Phone' should not be empty.
Postal Code' must be between 0 and 20 characters. You entered <char> characters.
Postal Code' must be between 1 and 20 characters in length.
Reason Id' is not valid.
Reference Transaction Id' is not valid.
Return Url' should not be empty.
DirectSale 16
'Sale Transaction Id' is not valid.
Shipping Address Line1' can not contain a credit card number.
Shipping Address Line1' must be between 0 and 100 characters. You entered <char> characters.
Shipping Address Line2' can not contain a credit card number.
Shipping Address Line2' must be between 0 and 100 characters. You entered <char> characters.
Shipping City' can not contain a credit card number.
Shipping City' must be between 0 and 50 characters. You entered <char> characters.
Shipping Country Id' can not contain a credit card number.
Shipping Country Id' is not valid.
Shipping First Name' can not contain a credit card number.
Shipping First Name' must be between 0 and 50 characters. You entered <char> characters.
Shipping Last Name' can not contain a credit card number.
Shipping Last Name' must be between 0 and 50 characters. You entered <char> characters.
Shipping Phone' must be between 0 and 20 characters. You entered <char> characters.
Shipping Postal Code' can not contain a credit card number.
Shipping Postal Code' must be between 0 and 20 characters. You entered <char> characters.
Shipping State' can not contain a credit card number.
Shipping State' must be between 0 and 50 characters. You entered <char> characters.
Site Id' can not contain a credit card number.
'Site Id' is not valid.
'State' can not contain a credit card number.
State' must be between 0 and 50 characters. You entered <char> characters.
State' must be between 1 and 50 characters.
Subscription plan id' is not valid.
Token Id' is not valid.
Tracking Id' must be between 0 and 100 characters. You entered <char> characters.
Validation error for input parameters.
Verify Transaction Id' is not valid.
XID is required when supplying ECI or ACS Verification Id.
DirectSale 17
APPENDIX D – SCRUB MESSAGES
Amount Limit
Approved Refferer Url Required
Card Bank ID Number IP Address
Card Decline Limiting
Card Holder Name
Card Limit
Country Black List
Credit Card Name and Customer Name Match
CVV2 Required
CyberSource
Email Limit
Email Required
Expired Credit Card
IP Address Bill
IP Black List
Name Credit Card Match
Name Declined Limit
Name Limit
Non US Customer
Phone Required
Price Limit
Price Minimum/Maximum
Refund Limit
Region Black List
APPENDIX E – ERROR MESSAGE
3D security is not enabled for this merchant.
Account associated with token is either deleted or disabled.
DirectSale 18
An address is required for this transaction.
An internal exception has occurred. Please refer to Error Id - <errorid>
Authorization headers not contained in the request.
Cannot do a full charge back for this transaction. Only partial charge back is allowed.
Cannot do a full refund for this transaction. Only partial refund is allowed.
Cannot do a full retrieval for this transaction. Only partial retrieval is allowed.
Capture amount is greater than the remaining authorization amount to be captured.
Capture is not enabled.
Cascade set up not valid for this transaction.
Client is not valid.
Credit card token used for transaction is no longer valid.
Critical error. Contact UnicornPayment.
Direct integration is not enabled.
Forced capture must have a bank reference as well.
Forced refund must have a bank reference as well.
Invalid Permissions.
Invalid principal identity.
Invalid transaction parameter(s).
Merchant does not exist or is no longer active.
Not a valid user.
Not able to capture. The transaction might be voided or already captured.
Not able to refund. The transaction might have CBK1 record or is already refunded.
Not authorized to access this resource.
Not authorized to execute this method.
Null Reason Code or specified Reason Code does not match the Card and Transaction Type thus cannot be
authorized.
Partial charge back amount is greater than the remaining amount to be charged back.
Partial refund amount is greater than the remaining amount to be refunded.
Partial retrieval amount is greater than the remaining amount to be retrieved.
Rates not available for credit card and currency type.
DirectSale 19
Refund is not enabled.
Request is not in correct format.
Service connection failed.
Site does not belong to the merchant.
Site does not exist or is no longer active.
Subscription plan is not valid.
Test card is not enabled.
The authenticaiton token in no longed valid.
The credit card number is blacklisted.
The site is missing required bank parameter.
The specified transaction is not valid for Blacklisting.
The specified transaction is not valid for CBK1 Credit.
The specified transaction is not valid for Charge back.
The specified transaction is not valid for Dispute.
The specified transaction is not valid for Void.
The specified transaction is not valid for Whitelisting.
The volume limit for transactions have been exceeded.
This account is currently disabled, please contact risk@unicornpayment.com with any questions.
This function is not supported by the bank.
This transaction has already been captured.
This transaction is already been charged back.
This transaction is already been initiated for retrieval.
This transaction is already been refunded.
This transaction is already been voided.
Time period to capture this transaction has expired.
Transaction id is not valid.
Transaction is declined for failed 3D authentication. 3D authentication is required for this merchant.
Unable to locate successful transaction details.
User is disabled or is no longer active.
User not mapped to any account.
DirectSale 20
Virtual terminal is not enabled.
APPENDIX F – DECLINE MESSAGE
Refer to card issuer
Refer to card issuer special conditions
Invalid merchant
Pick up card
Authorization Declined
Error
Pick up card special condition
Time-Out
No Original
Unable to Reverse
Retain
Unknown
Do Not Honour
Invalid Transaction for Terminal
Honour with ID
Transaction Not Allowed
Transaction cannot be completed
Invalid originator
Duplicate Transaction
Blocked, first use.
No From Account.
Partial Approval
No To Account.
Invalid/nonexisten account specified (general).
No credit account.
PIN Entry Required.
Stop Payment Order. Recurring.
Amount no longer available.
PIN Validation not possible.
Purchase Amount Only, No cash back allowed.
Cryptographic failure.
Legal violation.
Invalid transaction
Security Breach.
Date and Time Not Plausible.
Blacklisted Credit Card Number.
Blocked by processor.
DirectSale 21
Technical Error Acquirer.
Processing Network Unavailable.
Deposit is already referenced by a chargeback.
Invalid Descriptor.
Invalid Amount
Invalid card number
Invalid Issuer
Invalid Expiry Date
Invalid capture date
Resubmit
Incorrect response (error in issuer area)
No Action Taken
Stop Payment Purchase Order
Revocation of the authorized order
Revocation of all authorized orders
Unable to locate record in file
Duplicate Record, previous record replaced.
Edit error in file unauthorized.
Access to file unauthorized.
Unable to update file.
Format Error
Issuer not allowed
Partial Reversal
Suspected manipulation
Account invalid
No credit account
Requested function not supported
Lost Card, Pickup
Stolen card
Transaction Back Off
Transaction not permitted
Insufficient funds
No checking account
No savings account
Expired card
Invalid PIN
Card not in authorizer database
Not permitted
Transaction Not Permitted on Terminal
Suspected fraud
Card acceptor must contact acquirer
Exceeds amount limit
Restricted card
DirectSale 22
MAC Key Error
Exceeds frequency limit
Exceeds acquirer limit
Retain Card, no reason specified
Response received too late
Exceeds PIN Retry
Invalid Account
Issuer does not participate in the service
Function Not Available
Key Validation Error
Approval for Purchase Amount Only
Unable to Verify PIN
Invalid CVV
Not declined (AVS Only)
Invalid Life Cycle of transaction
No Keys To Use
KME Sync Error
PIN Key Error
MAC Sync Error
Security Violation
Issuer not available
Invalid card type
CVV required
Invalid Currency
System Malfunction
No Funds Transfer
Duplicate Reversal
Bank error
Success
Unknown
Input Data
User Abor
Timeout
Processor Local Error
Processor Remote Error
Processor Local Decline
Processor Remote Decline
Success.
Declined.
Error.
DirectSale 23