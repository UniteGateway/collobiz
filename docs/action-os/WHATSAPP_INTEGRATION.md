# WhatsApp

- Uses the existing opt-in (`/v1/me/whatsapp`): number, consent text and timestamp, update kinds; opt-out any time.
- ACTION OS queues a WhatsApp summary only when the user opted in **and** a WhatsApp Business provider with an approved
  utility template is connected (`providerConnected('whatsapp')`). Today it records `not_configured` and sends nothing.
- Content: headline counts and up to three titles; confidential items appear as "Confidential item — open COLLABIZ to
  view"; never amounts, customer, bank or investment details. No marketing messages.
- Before going live: choose an official Business Solution Provider or the Cloud API, register the sender number, get the
  template approved, add delivery-status webhooks, retries and rate/cost limits, and follow Meta's WhatsApp Business
  policies and the 24-hour customer-service window rules.
