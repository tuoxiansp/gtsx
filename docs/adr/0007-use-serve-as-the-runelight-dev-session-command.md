# Use serve as the Runelight dev session command

Runelight will use `runelight serve` as the primary command for starting a local **Runelight Serve Session**. Studio and capture are capabilities of that served Runelight dev environment, so `serve` better names the wrapper's job than `studio`: it starts the Host in **Runelight Dev Mode**, exposes the conventional **Runelight Route Space**, and gives downstream commands a running environment to target.
