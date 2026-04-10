UNICORNGROUP – QUICKPAY
TABLE OF CONTENTS
Revision History ............................................................................................................................................................. 1
Overview ....................................................................................................................................................................... 2
What is quickpay ...................................................................................................................................................... 2
Required information ............................................................................................................................................... 2
Subscription .............................................................................................................................................................. 2
Process for quickpay page ............................................................................................................................................ 2
Hosted Payment url End-Point ................................................................................................................................. 2
Quickpay fields ......................................................................................................................................................... 2
configuring your site – example forms ..................................................................................................................... 3
Purchase form .......................................................................................................................................................... 3
HTML subscription form ........................................................................................................................................... 3
HTML One time purchase form ................................................................................................................................ 4
Complete page ......................................................................................................................................................... 5
Confirm page ............................................................................................................................................................ 5
Membership Confirm page ....................................................................................................................................... 6
Cancel form ................................................................................................................................................................... 7
Appendix A – Transaction State Types .......................................................................................................................... 7
Appendix B – Transaction Status Types ........................................................................................................................ 8
Appendix C – Membership action ................................................................................................................................. 8
REVISION HISTORY
Date Revision Description Author
1/21/2020 1 First Version Derek Baehr
8/28/2020 1.4 Fixed Link Derek Baehr
QuickPay: Version 1.3 Page 1
OVERVIEW
WHAT IS QUICKPAY
The UnicornGroup Quickpay Payment API can process your online purchases with a minimal amount of
programming. Both shopping cart and subscription transactions can be submitted.
The Payment API uses an HTTP POST to initiate the request to UnicornGroup. This POST can be accomplished with
any web programming language, or even a simple web page.
REQUIRED INFORMATION
Before you will be able to submit transactions to UnicornGroup, you will need an UnicornGroup merchant account
for your website. Once you have a merchant account approved, you will be able to locate the QuickPayToken in
the Merchant Portal
These IDs uniquely identify your websites, customers, and payments.
SUBSCRIPTION
If your website is a subscription site, you will also need UnicornGroup to configure subscription groups for you. The
groups will set the level, pricing, and term for your subscriptions. For example, you may have a standard
subscription that costs $19.95 per month, and a premium subscription that costs $99.99 per quarter.
UnicornGroup will automatically handle rebilling your customer at the end of each term period.
PROCESS FOR QUICKPAY PAGE
HOSTED PAYMENT URL END-POINT
The URL to submit your customer for payment is as follows:
https://quickpay.ugpayments.ch/
QUICKPAY FIELDS
The following table lists the fields for quickpay transactions:
Field Type/Length Required/Optional
Address string(100) optional
Address2 string(100) optional
AmountShipping decimal number optional
AmountTotal
decimal number(must equal the sum of all
ItemAmount[N] and AmountShipping) required
ApprovedURL string(must be valid URL format) required
City string(50) optional
ConfirmURL string(must be valid URL format) optional
QuickPay: Version 1.3 Page 2
Country string(2) optional
CurrencyID string(3) required
DeclinedURL string(must be valid URL format) optional
Email string(must be valid email format) optional
FirstName string(50) optional
IsInitialForRecurring boolean("true" or "false", default “false”) optional
ItemAmount[n] decimal number required
ItemDesc[n] string(500) required
ItemName[n] string(500) required
ItemQuantity[n] integer required
LastName string(50) optional
MembershipRequired boolean("true" or "false", default “false”) optional
MembershipUsername string optional
MerchantReference string(100) optional
Phone string(must be valid phone format)(20) optional
PostalCode string(20) optional
QuickPayToken string(128) required
ShippingRequired boolean("true" or "false", default “false”) optional
ShowUserNamePassword boolean("true" or "false", default “false”) optional
SiteID integer required
State string(50) optional
SubscriptionPlanId integer optional
CONFIGURING YOUR SITE – EXAMPLE FORMS
You will need to add two web pages to your site to process payments. The first page is a purchase form, which is a
web page or form that initiates the UnicornGroup payment process. The second page is a complete page, where
your customers are returned to after successfully completing a purchase.
PURCHASE FORM
The purchase form can be any page or pages on your site that is capable of posting information to UnicornGroup.
It can be written in any web programming language or even simple HTML. Purchase forms can be constructed to
purchase recurring subscriptions or products through UnicornGroup. Here are examples of a subscription and a
shopping cart form:
HTML SUBSCRIPTION FORM
<form name="formname" method="post" action="https://quickpay.ugpayments.ch/">
<input name="QuickPayToken" type="hidden" value=”value from UnicornGroup">
QuickPay: Version 1.3 Page 3
<input name="SiteID" type="hidden" value="value from UnicornGroup">
<input name="AmountTotal" type="hidden" value="0.00">
<input name="CurrencyID" type="hidden" value="USD">
<input name="AmountShipping" type="hidden" value="0.00">
<input name="ShippingRequired" type="hidden" value="false">
<input name="MembershipRequired" type="hidden" value="true">
<input name="ItemName[0]" type="hidden" value="Product Name">
<input name="ItemQuantity[0]" type="hidden" value="0">
<input name="ItemAmount[0]" type="hidden" value="0.00">
<input name="ItemDesc[0]" type="hidden" value="Product Description">
<input name="ApprovedURL" type="hidden" value="http://www.yoursite.com/success.html">
<input name="ConfirmURL" type="hidden" value="http://www. yoursite.com /complete.php">
<input name="DeclinedURL" type="hidden" value="http://www. yoursite.com /decline.html">
<input name="MerchantReference" type="hidden" value="your order number">
<input name="MembershipUsername" type="hidden" value="testusername">
<input name="SubscriptionPlanId" type="hidden" value=”value from UnicornGroup">
<input name="ShowUserNamePassword" type="hidden" value="true"><br />
<input type="submit" value="Subscribe">
</form>
The above form HTML also includes an optional “MerchantReference” field. This field can be used to correlate the
UnicornGroup purchase transaction with data from your website application. Your web designer and programmer
will need to furnish your site with a similar purchase form that includes all of the necessary styling required to
match your site.
Please note, the fields in RED are provided by UnicornGroup when your account is approved.
HTML ONE TIME PURCHASE FORM
A simple HTML form can be used for purchases of a single item from your website using UnicornGroup. The
following is a single item purchase example:
<form name="formname" method="post" action="https://quickpay.ugpayments.ch/">
<input name="QuickPayToken" type="hidden" value=”value from UnicornGroup">
<input name="SiteID" type="hidden" value="value from UnicornGroup">
<input name="AmountTotal" type="hidden" value="20.00">
<input name="CurrencyID" type="hidden" value="USD">
<input name="AmountShipping" type="hidden" value="0.00">
<input name="ShippingRequired" type="hidden" value="false">
<input name="MembershipRequired" type="hidden" value="False">
<input name="ItemName[0]" type="hidden" value="Product Name">
<input name="ItemQuantity[0]" type="hidden" value="0">
<input name="ItemAmount[0]" type="hidden" value="20.00">
<input name="ItemDesc[0]" type="hidden" value="Product Description">
<input name="ApprovedURL" type="hidden" value="http://www.yoursite.com/success.html">
<input name="ConfirmURL" type="hidden" value="http://www. yoursite.com /complete.php">
<input name="DeclinedURL" type="hidden" value="http://www. yoursite.com /decline.html">
<input name="MerchantReference" type="hidden" value="your order number">
<input type="submit" value="Subscribe">
</form>
QuickPay: Version 1.3 Page 4
The above example will submit a transaction to purchase a single item for $20.00. Notice the AmountTotal equals
the ItemAmount + AmountShipping.}
COMPLETE PAGE
The complete page can be any page on your website. This page should welcome the customer back and provide
any additional information regarding their product or subscription purchase. Additional information would include:
shipping information, subscription activation, etc.
The URL of the completed page is supplied by your page or application in the ApprovedURL field.
When a customer has completed the purchase, UnicornGroup will load the designated page on your website and
provide the transaction ID and merchant reference supplied in the purchase form.
For example: if you provided the
following ApprovedURL in your purchase form –
http://oursite.com/complete.html
UnicornGroup would complete the transaction and return the customer to the following URL:
http://oursite.com/complete.html?TransactionID=67890123-cdef&MerchantReference=abc123
CONFIRM PAGE
When a customer has successfully completed a transaction, UnicornGroup will send an HTTP POST with the
transaction details back to a designated page on your site. This page should validate and store the transaction
information in your database. The confirm page provides communication between UnicornGroup and your
application and does not need to provide user functionality.
The URL of the confirm page is supplied by your page or application in the ConfirmURL field. This URL must be
supplied and it must be a valid page on your website or application. If a URL is not supplied or it does not point to a
page on your site, the transaction will not be completed successfully. However, if you do not wish to save the
transaction information, this page can be a simple, blank HTML page.
Information is posted to the confirm page as standard HTTP POST name-value pairs (NVP) separated by
ampersands (&). An example confirm post would be:
Amount=17.99&MerchantReference=abc123&PayReferenceID=b9ab260b-d690-
4507-8d56-8bd92c4c132a&TransactionID=4cfdefc3-6ad2-49de-a25b-
5d0f41e8cd1a
The following fields are transmitted by UnicornGroup in a transaction to the ConfirmURL specified by you:
[MerchantReference] => Reference Number for the Merchant’s Records (Limit 100 characters)
[Amount] => Amount of Transaction (Money/Numeric/Decimal)
[TransactionID] => Identity Number for the Transaction (Numeric)
[CardMask] => Characters used to mask the card number
[TransactionState] => State of Transaction (Appendix A)
QuickPay: Version 1.3 Page 5
[ShippingFirstName] => First Name for Shipping Address (Limit 50 characters)
[ShippingLastName] => Last Name for Shipping Address (Limit 50 characters)
[ShippingAddress1] => Address Line 1 for Shipping Address (Limit 100 characters)
[ShippingAddress2] => Address Line 2 for Shipping Address (Limit 100 characters)
[ShippingCity] => City for Shipping Address (Limit 50 characters)
[ShippingState] => State for Shipping Address (Limit 50 characters)
[ShippingCountry] => Country for Shipping Address
[ShippingPostalCode] => Postal Code for Shipping Address (Limit 20 characters)
[CustomerEmail] => mailto:person@mail.com Email for the Customer (Limit 50 characters)
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
MEMBERSHIP CONFIRM PAGE
When a customer has successfully completed a membership, UnicornGroup will send an HTTP POST with the
membershp details back to a designated page on your site. This page should validate and store the membership
information in your database. The confirm page provides communication between UnicornGroup and your
application and does not need to provide user functionality.
The URL of the confirm page is updated by logging into the gateway, going to Merchant Setup/Sites, and update
the field Member Postback URL:
Information is posted to the confirm page as standard HTTP POST name-value pairs (NVP) separated by
ampersands (&). An example confirm post would be:
Action=Add&Key=&Username=subscriptionUserName&FirstName=Test&LastName=User&SubscriiptionPlanId=364
&SubscriptionPlanId&10659&MemberId=545445&TrackingID=YourtransactionNumber&MerchantReference=Your
transactionNumber
QuickPay: Version 1.3 Page 6
The following fields are transmitted by UnicornGroup in a transaction to the Member Postback URL specified by
you:
[Action] => Membership Action, example, Add, Cancel, Inactive
[Key] => Key is entered in gateway, you can use this to verify the postback
[Email] => Email of customer
[Username] => Username of Customer
[FirstName] => FirstName of Customer
[LastName] => LastName of Customer
[SubscriptionGroupId] => ID of Subscription Plan
[SubscriptionPlanId] => Plan ID
[MemberId] => ID of Member
[TrackingId] => YourTrackingID
[MerchantReference] => YourMerchantReference (same as TrackingID)
CANCEL FORM
If you wish to all a customer to cancel their membership on your site, you can add the following html form:
<form method="post" id="buy_now" runat="server" action="https://quickpay.ugpayments.ch/Cancel"
novalidate="novalidate">
<div class="form-row">
<label>QuickPay Token</label>
<input name="QuickpayToken" type="text" value="YourQuickpayToken">
</div>
<div class="form-row">
<label>Username</label>
<input name="username" type="text" value="CustomersUsername">
</div>
<div class="form-row">
<label>Site ID</label>
<input name="SiteID" type="text" value="YourSITEID">
</div>
<div class="form-row">
<input type="submit" value="Cancel Subscription">
</div>
</form>
APPENDIX A – TRANSACTION STATE TYPES
QuickPay: Version 1.3 Page 7
Sale
Authorize
Capture
Void
Refund
Chargeback
Credit
CBK1
Verify
Recurring
APPENDIX B – TRANSACTION STATUS TYPES
APPENDIX C – MEMBERSHIP ACTION
Add
Cancel
Inactive
Successful
Error
Declined
Pending
Scrubbed
Fraud
Unconfirmed

------

