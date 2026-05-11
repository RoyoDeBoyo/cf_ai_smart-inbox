export async function calculateSmartDepartureExec(agent: any, input: any) {
  const { origin, destination, mode, arriveBy } = input;
  const apiKey = agent.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) return "Error: Google Maps API key is missing.";

  const url = "https://routes.googleapis.com/directions/v2:computeRoutes";
  
  const payload: any = {
    origin: { address: origin },
    destination: { address: destination },
    travelMode: mode // "WALK", "TRANSIT", or "DRIVE"
  };

  // Google ONLY allows arrivalTime for TRANSIT routes
  if (mode === "TRANSIT" && arriveBy) {
    try {
      // Google requires strict RFC3339 format (e.g., "2026-04-30T18:00:00Z")
      payload.arrivalTime = new Date(arriveBy).toISOString();
    } catch (e) {
      return "Error: Could not parse the arriveBy time. Ensure it is a valid date string.";
    }
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        // Request the route duration
        "X-Goog-FieldMask": "routes.duration"
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json() as any;

    if (!data.routes || data.routes.length === 0) {
      return `Could not find a ${mode} route between '${origin}' and '${destination}'.`;
    }

    // Google returns duration as a string like "1500s"
    const durationSeconds = parseInt(data.routes[0].duration.replace('s', ''));
    const travelMinutes = Math.round(durationSeconds / 60);

    // --- BUFFER MATH ---
    let bufferMinutes = travelMinutes * 0.25;
    
    // Cap buffer at 60 mins for Transit/Drive, but cap at 15 mins for Walking (you don't need a 1 hour buffer to walk!)
    const maxBuffer = mode === "WALK" ? 15 : 60;
    if (bufferMinutes > maxBuffer) bufferMinutes = maxBuffer; 
    
    const totalAdvanceMinutes = Math.round(travelMinutes + bufferMinutes);

    return `Travel time (${mode}) from '${origin}' to '${destination}' is ${travelMinutes} minutes. 
With a recommended safety buffer of ${Math.round(bufferMinutes)} minutes, the total travel time to plan for is ${totalAdvanceMinutes} minutes.

INSTRUCTION FOR AI: 
- If the user asked to set a reminder/alarm: Subtract ${totalAdvanceMinutes} minutes from their arrival time and use the 'scheduleReminder' tool to set it. 
- If the user is just asking for the travel time: Do NOT set a reminder. Just answer them naturally with the travel time and the recommended buffer.`;
  } catch (error) {
    return `Failed to contact Google Maps API: ${error}`;
  }
}