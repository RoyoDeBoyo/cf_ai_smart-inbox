# 📝 To-Do: Smart Inbox AI Assistant

## Phase 1: Give the AI a Voice
**Goal:** Implement a fast, local Text-to-Speech engine that supports dynamic emotional range using Kasane Teto's synth V voice.

- [ ] **Generate TTS Training Data**
    - [ ] Use synth V and Kasane Teto AI.
    - [ ] Render the output as .wav files.
- [ ] **Train the model**
    - [ ] Convert the training data into small chunks
    - [ ] Use Apolio RVC to train the model
    - [ ] Export the resulting `.pth` and `.index` files.
- [ ] **Set up the TTS Engine**
    - [ ] Upload the `.pth` and `.index` files to the cloud.
    - [ ] Set up an inference environment through Applio-CLI
- [ ] **Build the Emotion Router**
    - [ ] Write a Python script to intercept Cloudflare's text responses.
    - [ ] Parse the LLM's emotion tags (e.g., `<Urgent>`).
    - [ ] Route the text to the corresponding Speaker ID/Voice Profile before audio synthesis.

## Phase 2: Implement Web Searching (Tavily API)
**Goal:** Give the AI the ability to surf the web.

- [ ] **API Setup**
    - [ ] Create a developer account at [Tavily](https://tavily.com).
- [ ] **Cloudflare Worker Integration**
    - [ ] Write a `search_web` tool function in your Worker that uses Tavily.
- [ ] **LLM Prompting**
    - [ ] Update the system prompt for the LLM so it knows it has access to the `search_web` tool.
    - [ ] Test the pipeline: Ask it for search results.

## Phase 3: Implement Context Saving (Token Optimization)
**Goal:** Prevent memory loss in models during long conversations by summarizing conversations.

- [ ] **Set up the Context Manager Model**
    - [ ] Pull a lightweight, fast model (like Llama-3-8B) to act as the dedicated summarizer.
- [ ] **Build the Orchestrator Script**
    - [ ] Make the most recent messages get summarized by the ligher model before being sent to the larger LLM.
    - [ ] Send the new summarized transcript to the LLM instead of the longer uncompressed one.
- [ ] **State Replacement**
    - [ ] Program the script to overwrite the old, heavy messages in the chat history with the lightweight summary block before sending the final prompt to the main LLM.

## Phase 4: Set up Cloudflare Vectorize for dynamic memory routing
**Goal:** Semantic routing system to achieve "infinite" memory with a fixed token cost.

- [ ] **Set up Vector Database**
    - [ ] Provision a Cloudflare Vectorize index for saving contextual summaries.
- [ ] **Implement Intent Router**
    - [ ] Deploy a fast routing model to classify incoming messages into topics.
- [ ] **Implement State Save & Swap Logic**
    - [ ] When a topic shift is detected, trigger the Context Manager to summarize the active context.
    - [ ] Save the summary into Cloudflare Vectorize tagged with its topic, and clear the active memory.
    - [ ] Search the Vectorize database for the newly detected topic and retrieve past summaries to feed into the main model's context.

## Phase 5: Dynamic Tool Loading (MCP Server Routing)
**Goal:** Enable the AI to work in many different contexts by dynamically mounting and unmounting specialized Model Context Protocol (MCP) servers based on active intent, saving tokens and preventing tool hallucinations.

- [ ] **Define Specialized Personas & Tools**
    - [ ] Draft a master `SOUL.md` to define the AI's core personality across all modes. (You have to select a topic to work from, topics available to you are x, y, z.)
    - [ ] Draft context-specific `AGENT.md` files for distinct mindsets (e.g. You are a coding assisstant that has access to the internet and GitHub. You are a meal planner, you have access to the food inventory and recipes in an SQL databse).
- [ ] **Configure Independent MCP Servers**
    - [ ] Set up MCP's for different focuses when they arise.
- [ ] **Update the Intent Router**
    - [ ] Modify the Phase 4 routing model: When a topic shift is detected, instruct it to output the Vectorize memory tag *and* the required MCP server identifier.
- [ ] **Implement Dynamic Mounting Logic**
    - [ ] Program the orchestrator to inject the correct `AGENT.md` instructions into the system prompt based on the detected intent.
    - [ ] Program the orchestrator to connect the required MCP server and explicitly *disconnect* all other toolsets before sending the prompt to the main LLM.
- [ ] **Security & Isolation Testing**
    - [ ] Test context bleed: Deliberately ask the AI to execute a terminal command while it is in a different context to verify the Dev MCP is properly unmounted and the action fails.