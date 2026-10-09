import { Plugin } from "obsidian";

process.env.COURTLISTENER_API_TOKEN = "YOUR_API_TOKEN_HERE";

export default class extends Plugin {
  async onload() {    
    console.log("Hello world");
  }
}