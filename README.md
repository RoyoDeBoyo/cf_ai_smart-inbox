# cf_ai_smart-inbox
 A cloudflare challenge to make a AI agent work for you

This is a small AI worker project that does the basics of the template code provided from the cloudflare website, along with a custom scheduling and reminder system.
In order to test this out for yourself you need to change line 270 in server.ts to include a discord webhook link.
Once that's done you can start up the server by running npm start dev and begin inference.

The model currently being used is kimi k2.5
You can give the AI a stream of thoughts and it will pick apart scheduiling requests to remind you at a later date.

An example prompt can be used here:

```
I just got home from work and my manager told me that I have a new project due by Friday at 5pm. He was very adamant about it containing information about the company revenue and expecte growth, he also said that I need to make it interactive. I met up with Gary today as well and he invited me over to his place for dinner tomorrow at 6, I should get him a gift for inviting me.
```

The expected response should be an output to the terminal saying that the reminder has been scheduled and then on the time specified a discord message will be sent through the webhook provided with categorised information including a list format for related activities.