# cf_ai_smart-inbox
 A cloudflare challenge to make a AI agent work for you

This is a small AI worker project that does the basics of the template code provided from the cloudflare website, along with a custom scheduling and reminder system, and the ability to check stocks and shares isa's and investment accounts on the trading platform Trading 212.
In order to test this out for yourself you need to add an environment variable in a folder called `.dev.cars` with a field, `DISCORD_WEBHOOK_URL` with your webhook url as a string, do the same with `T212_API_KEY` and `T212_API_SECRET` both as strings. Then update the types by running `npx wrangler types`
Once that's done you can start up the server by running npm start dev and begin inference.

The model currently being used is google's gemma-4-26b-a4b-it
You can give the AI a stream of thoughts and it will pick apart scheduiling requests to remind you at a later date.

An example prompt can be used here:
```
I just booked a flight for paris which leaves on Friday at 8am. Can you remind me to bring my passport, boarding pass and luggage with me
```
The expected response should be an output to the terminal saying that the reminder has been scheduled and then on the time specified a discord message will be sent through the webhook provided with categorised information including a list format for related activities.

```
How is my portfolio doing?
```

This will respond with your stocks portfolio, including your dividend yield, specific shares in each company and your total value.