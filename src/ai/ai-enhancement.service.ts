import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AiEnhancementService {
  private genAI: GoogleGenerativeAI;
  private systemDesignDoc: string = '';

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
    this.loadGroundingDocs();
  }

  private loadGroundingDocs() {
    try {
      const docPath = path.join(process.cwd(), 'IMPACTIS_SYSTEM_DESIGN_v3.md');
      if (fs.existsSync(docPath)) {
        this.systemDesignDoc = fs.readFileSync(docPath, 'utf8').slice(0, 50000); // 50k chars limit for system prompt grounding
      }
    } catch (error) {
      console.error('Failed to load grounding docs:', error);
    }
  }

  async generateSupportReply(userMessage: string, history: { role: string; content: string }[]): Promise<string> {
    if (!this.genAI) return 'I am currently in demo mode as my AI engine is not configured.';

    const model = this.genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: `You are the Impactis Support Bot. Your goal is to help users navigate the Impactis platform.
Impactis is a three-sided marketplace for Startups, Investors, and Advisors.

CORE RULES FROM SYSTEM DESIGN:
${this.systemDesignDoc}

Guidelines:
- If asked about fees, connection limits, or tiers, refer to the documentation above.
- Be professional, concise, and helpful.
- If you don't know the answer, suggest escalating to a human agent.
- Free tier connection limit: 2 per month.
- Data Room is ELITE tier only.`,
    });

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.content }],
      })),
    });

    try {
      const result = await chat.sendMessage(userMessage);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini error:', error);
      return 'I encountered an error while processing your request. Please try again or escalate to a human agent.';
    }
  }

  async enhanceText(text: string, context: string): Promise<string> {
    if (!this.genAI) return text;

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are a professional business writer. Please enhance the following ${context} for a startup platform called Impactis. 
Make it more professional, compelling, and clear while preserving the original facts.

Original text:
${text}

Enhanced version:`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text();
    } catch (error) {
      console.error('Gemini error:', error);
      return text;
    }
  }

  async analyzeReadiness(profileData: any): Promise<{ summary: string; riskFlags: string[] }> {
    if (!this.genAI) return { summary: 'AI engine not configured.', riskFlags: [] };

    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `You are an expert VC analyst. Analyze the following startup profile for fundraising readiness.
Provide a concise summary of strengths and weaknesses, and list any significant risk flags.

PROFILE DATA:
${JSON.stringify(profileData, null, 2)}

Response format (JSON):
{
  "summary": "...",
  "riskFlags": ["flag 1", "flag 2"]
}`;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const jsonText = response.text().replace(/```json|```/g, '').trim();
      return JSON.parse(jsonText);
    } catch (error) {
      console.error('Gemini error:', error);
      return { summary: 'Error analyzing profile.', riskFlags: ['AI Analysis Error'] };
    }
  }
}
