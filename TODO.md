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

## Phase 2: Implement Context Saving (Token Optimization)
**Goal:** Prevent memory loss in models during long conversations by summarizing conversations.

- [ ] **Set up the Context Manager Model**
    - [ ] Pull a lightweight, fast model (like Llama-3-8B) to act as the dedicated summarizer.
- [ ] **Build the Orchestrator Script**
    - [ ] Make the most recent messages get summarized by the ligher model before being sent to the larger LLM.
    - [ ] Send the new summarized transcript to the LLM instead of the longer uncompressed one.
- [ ] **State Replacement**
    - [ ] Program the script to overwrite the old, heavy messages in the chat history with the lightweight summary block before sending the final prompt to the main LLM.

## Phase 3: Set up Cloudflare Vectorize for dynamic memory routing
**Goal:** Semantic routing system to achieve "infinite" memory with a fixed token cost.

- [ ] **Set up Vector Database**
    - [ ] Provision a Cloudflare Vectorize index for saving contextual summaries.
- [ ] **Implement Intent Router**
    - [ ] Deploy a fast routing model to classify incoming messages into topics.
- [ ] **Implement State Save & Swap Logic**
    - [ ] When a topic shift is detected, trigger the Context Manager to summarize the active context.
    - [ ] Save the summary into Cloudflare Vectorize tagged with its topic, and clear the active memory.
    - [ ] Search the Vectorize database for the newly detected topic and retrieve past summaries to feed into the main model's context.

## Phase 4: Dynamic Tool Loading (MCP Server Routing)
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

## Phase 5: Robotic Control
### 5a. Drones
**Goal:** Give the AI remote physical vision and locomotion using a drone, routing video and flight controls over a 5G mobile connection via a custom Android app.

- [ ] **Buy a DJI mini 3 drone**
    - [ ] [DJI drone](https://www.amazon.co.uk/DJI-Mini-Lightweight-Mechanical-Transmission/dp/B0CQ8DG1CX?th=1)
- [ ] **Android Bridge Development (Kotlin/ Java)**
    - [ ] Register for a DJI Developer Account
    - [ ] Download the DJI Mobile SDK V5 (or whatever is newest)
    - [ ] Create an Android app that connects to the drone via USB-C.
    - [ ] Implement simple commands to control the pitch, roll, yaw, throttle.
- [ ] **Establish Data Tunnels**
    - [ ] **Video:** Implement a WebRTC or UDP stream into the android app to send the drone camera feed to the AI server.
    - [ ] **Telemetry/Control:** Set up a WebSocket connection between the app and the server for JSON flight commands.
- [ ] **Drone MCP Server (Python backend)**
    - [ ] Write an MCP Server to connect to the drone.
    - [ ] Expose high-level tools to the LLM that integrate step 1. `survey_area()`, `turn_camera(degrees)`,`take_photo()`,`move_forward(meters)`.
- [ ] **Integrate AI vision**
    - [ ] Hook the incoming WebRTC/ UDP stream into an AI vision model like YOLO or Llama-3-vision.
    - [ ] Create an `analyze_video_feed()` MCP tool so the AI can "see" what the drone sees upon request.
- [ ] **Define a flight persona**
    - [ ] Create an `AGENT.md` for the drone mindset. Include saftey rules (e.g. "Do not exceed x m/s", "no erratic movements", "Describe the scene before acting", "Return home when on 15% battery").
- [ ] **Field Testing**
    - [ ] Test the drone in a variety of environments, quiet day, windy day, darkness, low signal area, etc.

### 5b. Cars
**Goal:** Give the AI access to a remote controled car so it can also see from the floor. Good for indoor areas or areas where a drone is not practical.

- [ ] **Buy a DJI RoboMaster S1 educational Kit**
    - [ ] [RoboMaster](https://www.amazon.co.uk/stores/DJI/page/57C56322-02A9-446B-B3F4-A461A6D0A5A6)
- [ ] **Update Android app**
    - [ ] Add a UI toggle switch for **Drone Mode** and **Car Mode**
    - [ ] Implement the DJI RoboMaster network protocol to connect the rover's IP address via Wi-Fi/TCP.
- [ ] **Establish Data Tunnel**
    - [ ] **Video:** Pull live H.264 video from the camera and stream it to the AI server.
    - [ ] **Telemetry/Control:** Use the same WebSocket to send movement commands and photo commands.
- [ ] **Car MCP Server (Python backend)**
    - [ ] Write an MCP server to connect to the car
    - [ ] Expose similar functions to that of the drone.
- [ ] **Integrate AI vision**
    - [ ] Hook the same video stream into the chosen AI vision model
    - [ ] Re-use/ re-create an `analyze_video_feed()` function so the AI can see from the car's perspective.
- [ ] **Define a driver persona**
    - [ ] Create an `AGENT.md` for the car midset. Include saftey rules (e.g. "Do not drive if it is unsafe", "Return home if below 15%")
- [ ] **Field Testing**
    - [ ] Test the car in a variety of different environments.


# Future tools to give the AI

## Implement Web Searching (Tavily API)
**Goal:** Give the AI the ability to surf the web.

- [ ] **API Setup**
    - [ ] Create a developer account at [Tavily](https://tavily.com).
- [ ] **Cloudflare Worker Integration**
    - [ ] Write a `search_web` tool function in your Worker that uses Tavily.
- [ ] **LLM Prompting**
    - [ ] Update the system prompt for the LLM so it knows it has access to the `search_web` tool.
    - [ ] Test the pipeline: Ask it for search results.

