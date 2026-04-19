# Email à Derek Baehr — draft v4

> **Context** : Cet email concerne UNIQUEMENT la migration QuickPay → Direct (declines US). La demande « fan subscription plan » (SubscriptionPlanId sur QuickPay) reste un **thread séparé**, non inclus ici — son draft est conservé tel que Thomas l'avait préparé pour un envoi séparé.

**To** : `derek@unicorngrp.ch`
**Cc** : `risk@unicorngrp.ch`
**Subject** : MID 103799 (exclu.at) — a few questions before we migrate to Direct

---

Hey Derek,

Thanks for getting the 2D cascade enabled and sending over the Direct token. Before we lock in the migration plan on our side, three things I want to clear up so we don't go build the wrong thing.

**First — does the cascade also apply to our current QuickPay flow?**
We're still live on QuickPay (SiteID 98845) and it'd be useful to know whether the cascade you just enabled will already start reducing US declines there, or if it only kicks in once we're on the Direct endpoints. If it already works on QuickPay we'd like to watch the decline rate for a couple of days before committing to the full migration.

**Second — hosted card capture or tokenization?**
The DirectSale doc you sent has us posting raw PAN and CVV in the JSON body, which would push us from PCI SAQ A to SAQ D — we'd rather avoid that. I see `Token Id` and references to vaulted card tokens in the validation errors and error messages, so I assume you expose a hosted field / tokenization flow somewhere. Could you send whatever docs cover that? If there's a way to post a token to `/saletransactions` instead of a raw card number, that changes our whole architecture.

**Third — how do we actually run the 3DS challenge?**
The validation errors list ACS / ECI / XID as fields the Sale endpoint accepts, so it looks like 3DS auth data gets passed into the same `/saletransactions` call rather than a separate "3D endpoint" — that part makes sense. What's not clear is how we get those values in the first place. Do you host a 3DS Server / challenge page we redirect the fan to, or do we need to bring our own (Cardinal, 3dsecure.io, etc.) and then forward ACS/ECI/XID to you? A short example of the expected sequence for a 3DS-required transaction would save us a lot of guessing.

A sandbox merchant would also help here if you have one — we'd rather test the full flow (auth → capture → refund → 3DS challenge) on something other than the production MID.

Happy to jump on a quick call if it's faster. #1 and #3 are the blockers for the migration plan.

Thanks,
Thomas
