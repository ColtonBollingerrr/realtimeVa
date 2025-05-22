const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

class VectorService {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
        
        this.openai = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY
        });
    }

    /**
     * Generate embedding for a text query
     */
    async generateEmbedding(text) {
        try {
            const response = await this.openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
                encoding_format: 'float'
            });
            
            return response.data[0].embedding;
        } catch (error) {
            console.error('Error generating embedding:', error);
            throw error;
        }
    }

    /**
     * Search for relevant documents using vector similarity
     */
    async searchDocuments(query, options = {}) {
        try {
            const {
                limit = 5,
                threshold = 0.7,
                projectType = null,
                serviceType = null
            } = options;

            // Generate embedding for the query
            const queryEmbedding = await this.generateEmbedding(query);
            
            // Build the RPC query
            let rpcQuery = this.supabase.rpc('match_documents', {
                query_embedding: queryEmbedding,
                match_threshold: threshold,
                match_count: limit
            });

            // Add metadata filters if provided
            if (projectType || serviceType) {
                const filters = {};
                if (projectType) filters.project_type = projectType;
                if (serviceType) filters.service_type = serviceType;
                
                rpcQuery = rpcQuery.filter('metadata', 'cs', JSON.stringify(filters));
            }

            const { data, error } = await rpcQuery;

            if (error) {
                console.error('Supabase search error:', error);
                throw error;
            }

            return data || [];
        } catch (error) {
            console.error('Error searching documents:', error);
            return [];
        }
    }

    /**
     * Add a new document to the vector store
     */
    async addDocument(content, metadata = {}) {
        try {
            const embedding = await this.generateEmbedding(content);
            
            const { data, error } = await this.supabase
                .from('documents')
                .insert({
                    content,
                    embedding,
                    metadata
                })
                .select();

            if (error) {
                console.error('Error adding document:', error);
                throw error;
            }

            return data[0];
        } catch (error) {
            console.error('Error adding document:', error);
            throw error;
        }
    }

    /**
     * Get contextual information for a conversation
     */
    async getContextualInfo(userMessage, conversationHistory = [], options = {}) {
        try {
            // Analyze the user message and conversation history to extract intent
            const context = await this.analyzeContext(userMessage, conversationHistory);
            
            // Search for relevant documents
            const relevantDocs = await this.searchDocuments(userMessage, {
                ...options,
                limit: 3,
                threshold: 0.75,
                projectType: context.projectType,
                serviceType: context.serviceType
            });

            // Format the context for the AI
            return this.formatContext(relevantDocs, context);
        } catch (error) {
            console.error('Error getting contextual info:', error);
            return null;
        }
    }

    /**
     * Analyze user message and conversation to extract context
     */
    async analyzeContext(userMessage, conversationHistory) {
        try {
            const messages = [
                {
                    role: 'system',
                    content: `Analyze the user message and conversation history to extract:
                    1. Project type (web development, mobile app, AI/ML, consulting, etc.)
                    2. Service type (development, design, consulting, maintenance, etc.)
                    3. Key topics or technologies mentioned
                    
                    Return a JSON object with: projectType, serviceType, topics, intent`
                },
                ...conversationHistory.slice(-3), // Last 3 messages for context
                {
                    role: 'user',
                    content: userMessage
                }
            ];

            const response = await this.openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages,
                temperature: 0.1,
                max_tokens: 200
            });

            try {
                return JSON.parse(response.choices[0].message.content);
            } catch {
                return {
                    projectType: null,
                    serviceType: null,
                    topics: [],
                    intent: 'general_inquiry'
                };
            }
        } catch (error) {
            console.error('Error analyzing context:', error);
            return {
                projectType: null,
                serviceType: null,
                topics: [],
                intent: 'general_inquiry'
            };
        }
    }

    /**
     * Format retrieved documents into context for the AI
     */
    formatContext(documents, analysisContext) {
        if (!documents || documents.length === 0) {
            return null;
        }

        const contextSections = documents.map(doc => ({
            content: doc.content,
            relevance: doc.similarity,
            metadata: doc.metadata
        }));

        return {
            relevantInfo: contextSections,
            userContext: analysisContext,
            instructions: `Use the following relevant information from our knowledge base to provide a comprehensive and accurate response. 
            Prioritize information with higher relevance scores. If the user is asking about specific services or projects, 
            focus on those areas. Always provide specific details and examples when available.`,
            totalDocuments: documents.length
        };
    }

    /**
     * Get enhanced system instructions with current context
     */
    async getEnhancedInstructions(baseInstructions, userMessage, conversationHistory = []) {
        const context = await this.getContextualInfo(userMessage, conversationHistory);
        
        if (!context) {
            return baseInstructions;
        }

        const contextualInstructions = `${baseInstructions}

RELEVANT CONTEXT FROM KNOWLEDGE BASE:
${context.relevantInfo.map((info, index) => 
    `[Document ${index + 1}] (Relevance: ${(info.relevance * 100).toFixed(1)}%)
    ${info.content}
    ${info.metadata.project_type ? `Project Type: ${info.metadata.project_type}` : ''}
    ${info.metadata.service_type ? `Service Type: ${info.metadata.service_type}` : ''}
`).join('\n')}

USER CONTEXT: ${JSON.stringify(context.userContext)}

${context.instructions}

Remember to:
- Reference specific information from the knowledge base when relevant
- Provide detailed examples and case studies when available
- Mention specific services, technologies, or methodologies we offer
- Be conversational and helpful while being informative`;

        return contextualInstructions;
    }
}

module.exports = VectorService;
