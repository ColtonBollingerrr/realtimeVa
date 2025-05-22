const VectorService = require('../services/vectorService');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

class DocumentManager {
    constructor() {
        this.vectorService = new VectorService();
    }

    /**
     * Batch upload documents from a directory
     */
    async uploadDocumentsFromDirectory(directoryPath, options = {}) {
        try {
            const files = await fs.readdir(directoryPath);
            const results = [];

            for (const file of files) {
                if (path.extname(file).toLowerCase() === '.txt') {
                    const filePath = path.join(directoryPath, file);
                    const content = await fs.readFile(filePath, 'utf-8');
                    
                    // Extract metadata from filename or content
                    const metadata = this.extractMetadata(file, content, options);
                    
                    try {
                        const result = await this.vectorService.addDocument(content, metadata);
                        results.push({ file, success: true, id: result.id });
                        console.log(`✅ Uploaded: ${file}`);
                    } catch (error) {
                        results.push({ file, success: false, error: error.message });
                        console.error(`❌ Failed to upload ${file}:`, error.message);
                    }
                }
            }

            return results;
        } catch (error) {
            console.error('Error uploading documents:', error);
            throw error;
        }
    }

    /**
     * Upload a single document with metadata
     */
    async uploadDocument(content, metadata = {}) {
        try {
            const result = await this.vectorService.addDocument(content, metadata);
            console.log(`✅ Document uploaded with ID: ${result.id}`);
            return result;
        } catch (error) {
            console.error('❌ Failed to upload document:', error.message);
            throw error;
        }
    }

    /**
     * Extract metadata from filename and content
     */
    extractMetadata(filename, content, options = {}) {
        const metadata = { ...options };
        
        // Extract from filename patterns
        const filenameLower = filename.toLowerCase();
        
        // Project types
        if (filenameLower.includes('web') || filenameLower.includes('website')) {
            metadata.project_type = 'web_development';
        } else if (filenameLower.includes('mobile') || filenameLower.includes('app')) {
            metadata.project_type = 'mobile_development';
        } else if (filenameLower.includes('ai') || filenameLower.includes('ml') || filenameLower.includes('machine-learning')) {
            metadata.project_type = 'ai_ml';
        } else if (filenameLower.includes('api') || filenameLower.includes('backend')) {
            metadata.project_type = 'backend_development';
        } else if (filenameLower.includes('consulting') || filenameLower.includes('strategy')) {
            metadata.project_type = 'consulting';
        }

        // Service types
        if (filenameLower.includes('development') || filenameLower.includes('dev')) {
            metadata.service_type = 'development';
        } else if (filenameLower.includes('design') || filenameLower.includes('ui') || filenameLower.includes('ux')) {
            metadata.service_type = 'design';
        } else if (filenameLower.includes('consulting') || filenameLower.includes('advisory')) {
            metadata.service_type = 'consulting';
        } else if (filenameLower.includes('maintenance') || filenameLower.includes('support')) {
            metadata.service_type = 'maintenance';
        } else if (filenameLower.includes('testing') || filenameLower.includes('qa')) {
            metadata.service_type = 'testing';
        }

        // Extract technologies from content
        const contentLower = content.toLowerCase();
        const technologies = [];
        
        const techKeywords = {
            'react': 'React',
            'vue': 'Vue.js',
            'angular': 'Angular',
            'node': 'Node.js',
            'python': 'Python',
            'django': 'Django',
            'flask': 'Flask',
            'javascript': 'JavaScript',
            'typescript': 'TypeScript',
            'php': 'PHP',
            'laravel': 'Laravel',
            'wordpress': 'WordPress',
            'shopify': 'Shopify',
            'aws': 'AWS',
            'azure': 'Azure',
            'gcp': 'Google Cloud',
            'docker': 'Docker',
            'kubernetes': 'Kubernetes',
            'mongodb': 'MongoDB',
            'postgresql': 'PostgreSQL',
            'mysql': 'MySQL',
            'redis': 'Redis',
            'tensorflow': 'TensorFlow',
            'pytorch': 'PyTorch',
            'scikit-learn': 'Scikit-learn',
            'nextjs': 'Next.js',
            'nuxt': 'Nuxt.js',
            'svelte': 'Svelte',
            'flutter': 'Flutter',
            'react native': 'React Native',
            'swift': 'Swift',
            'kotlin': 'Kotlin',
            'java': 'Java',
            'c#': 'C#',
            '.net': '.NET',
            'go': 'Go',
            'rust': 'Rust',
            'graphql': 'GraphQL',
            'rest api': 'REST API',
            'microservices': 'Microservices',
            'serverless': 'Serverless',
            'blockchain': 'Blockchain',
            'ethereum': 'Ethereum',
            'solidity': 'Solidity'
        };

        for (const [keyword, tech] of Object.entries(techKeywords)) {
            if (contentLower.includes(keyword)) {
                technologies.push(tech);
            }
        }

        if (technologies.length > 0) {
            metadata.technologies = [...new Set(technologies)]; // Remove duplicates
        }

        // Add document length and word count
        metadata.character_count = content.length;
        metadata.word_count = content.split(/\s+/).length;
        metadata.filename = filename;
        metadata.upload_date = new Date().toISOString();

        return metadata;
    }

    /**
     * Search for documents
     */
    async searchDocuments(query, options = {}) {
        try {
            const results = await this.vectorService.searchDocuments(query, options);
            console.log(`🔍 Found ${results.length} relevant documents for query: "${query}"`);
            
            results.forEach((doc, index) => {
                console.log(`\n${index + 1}. Similarity: ${(doc.similarity * 100).toFixed(1)}%`);
                console.log(`   Metadata: ${JSON.stringify(doc.metadata, null, 2)}`);
                console.log(`   Content: ${doc.content.substring(0, 200)}...`);
            });

            return results;
        } catch (error) {
            console.error('❌ Search failed:', error.message);
            throw error;
        }
    }

    /**
     * Get document statistics
     */
    async getStats() {
        try {
            const response = await fetch('http://localhost:3000/api/documents/stats');
            const data = await response.json();
            
            console.log('\n📊 Document Statistics:');
            console.log(`   Total Documents: ${data.stats.total_documents || 0}`);
            console.log(`   Project Types: ${data.stats.unique_project_types || 0}`);
            console.log(`   Service Types: ${data.stats.unique_service_types || 0}`);
            console.log(`   Latest Document: ${data.stats.latest_document || 'None'}`);
            
            return data.stats;
        } catch (error) {
            console.error('❌ Failed to get stats:', error.message);
            throw error;
        }
    }

    /**
     * Sample documents for testing
     */
    async uploadSampleDocuments() {
        const sampleDocs = [
            {
                content: `We offer comprehensive web development services using modern technologies like React, Next.js, and Node.js. Our team specializes in creating responsive, scalable web applications with excellent user experience. We handle everything from frontend development to backend API integration, database design, and deployment on AWS or other cloud platforms.`,
                metadata: {
                    project_type: 'web_development',
                    service_type: 'development',
                    technologies: ['React', 'Next.js', 'Node.js', 'AWS'],
                    title: 'Web Development Services'
                }
            },
            {
                content: `Our mobile app development team creates native iOS and Android applications using Swift, Kotlin, and cross-platform solutions like React Native and Flutter. We focus on performance, user experience, and seamless integration with device features. Our apps are designed to scale and provide excellent performance across all devices.`,
                metadata: {
                    project_type: 'mobile_development',
                    service_type: 'development',
                    technologies: ['Swift', 'Kotlin', 'React Native', 'Flutter'],
                    title: 'Mobile App Development'
                }
            },
            {
                content: `We provide AI and machine learning consulting services, including natural language processing, computer vision, and predictive analytics. Our team uses TensorFlow, PyTorch, and scikit-learn to build custom AI solutions. We help businesses integrate AI into their existing workflows and develop new AI-powered products.`,
                metadata: {
                    project_type: 'ai_ml',
                    service_type: 'consulting',
                    technologies: ['TensorFlow', 'PyTorch', 'Scikit-learn', 'Python'],
                    title: 'AI/ML Consulting Services'
                }
            },
            {
                content: `Our UI/UX design team creates intuitive, beautiful interfaces that enhance user engagement. We use modern design principles, conduct user research, create wireframes and prototypes, and ensure accessibility compliance. We work with tools like Figma, Adobe Creative Suite, and conduct usability testing to validate our designs.`,
                metadata: {
                    project_type: 'design',
                    service_type: 'design',
                    technologies: ['Figma', 'Adobe Creative Suite'],
                    title: 'UI/UX Design Services'
                }
            },
            {
                content: `We offer comprehensive DevOps and cloud infrastructure services using AWS, Azure, and Google Cloud. Our team sets up CI/CD pipelines, containerization with Docker and Kubernetes, monitoring solutions, and automated scaling. We ensure your applications are secure, scalable, and highly available.`,
                metadata: {
                    project_type: 'backend_development',
                    service_type: 'development',
                    technologies: ['AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes'],
                    title: 'DevOps and Cloud Services'
                }
            }
        ];

        const results = [];
        for (const doc of sampleDocs) {
            try {
                const result = await this.uploadDocument(doc.content, doc.metadata);
                results.push({ success: true, title: doc.metadata.title, id: result.id });
                console.log(`✅ Uploaded sample: ${doc.metadata.title}`);
            } catch (error) {
                results.push({ success: false, title: doc.metadata.title, error: error.message });
                console.error(`❌ Failed to upload ${doc.metadata.title}:`, error.message);
            }
        }

        return results;
    }
}

// CLI interface
async function main() {
    const manager = new DocumentManager();
    const command = process.argv[2];
    const arg = process.argv[3];

    try {
        switch (command) {
            case 'upload-dir':
                if (!arg) {
                    console.error('Please provide a directory path');
                    process.exit(1);
                }
                await manager.uploadDocumentsFromDirectory(arg);
                break;

            case 'upload-samples':
                await manager.uploadSampleDocuments();
                break;

            case 'search':
                if (!arg) {
                    console.error('Please provide a search query');
                    process.exit(1);
                }
                await manager.searchDocuments(arg);
                break;

            case 'stats':
                await manager.getStats();
                break;

            default:
                console.log(`
Usage: node scripts/documentManager.js <command> [arguments]

Commands:
  upload-dir <path>     Upload all .txt files from a directory
  upload-samples        Upload sample documents for testing
  search <query>        Search for documents
  stats                 Show document statistics

Examples:
  node scripts/documentManager.js upload-samples
  node scripts/documentManager.js upload-dir ./documents
  node scripts/documentManager.js search "web development"
  node scripts/documentManager.js stats
                `);
        }
    } catch (error) {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = DocumentManager;
