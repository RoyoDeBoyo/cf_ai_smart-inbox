# cf_ai_smart-inbox
 A cloudflare challenge to make a AI agent work for you

This is a small worker AI that can do many different things. It can pick apart streams of thought and do different things with that information. It can schedule reminders for things like work and travel and contrains some detail in those reminders, which get sent to you through a discord webhook. It can also use what you have in your pantry to suggest meals that you provide for it. It uses several small tables in an SQL database to do this. It has a shopping list, so that you can add things through a period of time and then when you're ready it'll send you the entire list and update the pantry with those items, if you coulnd't get something or got something slightly different it'll update the pantry with those items instead. It can also dynamically change the initial rating you give a meal if it notices you're getting sick of it. If it regognizes that you've had a busy week or you are tired then it'll gear towards more easy to cook meals instead of more complex ones. When making a meal it changes your pantry items as well. It has the capacity to suggest meals from the database it has and will suggest more items to buy if you're running low. If you want to see all available recipes with all available information it saves on tokens by just outputing the databse entry directly to the web-client. This ai can also check stocks and shares portfolio data on the trading platform Trading 212. It can see your holdings in each stock and combined dividend yield.
In order to test this out for yourself you need to add a file in the gentle-river folder called `.dev.vars` with a field, `DISCORD_WEBHOOK_URL` with your webhook url as a string, do the same with `T212_API_KEY` and `T212_API_SECRET` both as strings. Then update the types by running `npx wrangler types`
Once that's done you can start up the server by running npm start dev and begin inference.

The model currently being used is google's gemma-4-26b-a4b-it

An example prompt can be used here:
```
I just booked a flight for paris which leaves on Friday at 8am. Can you remind me to bring my passport, boarding pass and luggage with me.
```

```
Add egg fried rice to my recipes. I currenlty really like so it's going to get a 5/5 for enjoyment. it's a smiple meal to make so 1/5 for difficulty. it takes about 15 mins to make. I need 2 eggs, 75g of jasime/ long grain rice, 1 spring onion, 2 tablespoons of soy sauce and 1 teaspoon of lao gon ma. To make it you cook the rice. once the rice is done, start scrambling the eggs, add the rice and lao gon ma. After 30 seconds add the soy sauce and turn off th heat. Mix the rice well and then it's ready to serve.
```

```
How is my portfolio doing?
```

```
What is currently in my pantry?
```

```
Can you suggest me a meal to have today?
```

```
Add 500g of beef mince, 1kg carrots, 1 cucumber, 5kg of potatoes, some veg stock, a loaf of white bread, penut butter, unsalted butter, 1kg of plain flour and 1kg of self raising flour to my shopping list. 
```

```
whats on my shopping list right now?
```


```
I'm going shopping now.
```


```
They didn't have any carrots or veg stock at the store.
```


```
I got beef stock instead of veg stock.
```