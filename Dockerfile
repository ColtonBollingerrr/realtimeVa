# Use the official Node.js runtime as the base image
FROM node:18-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependenciaes
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Create the public directory if it doesn't exist
RUN mkdir -p public

# Expose the port the app runs on
EXPOSE 8080

# Define the command to run the application
CMD ["npm", "start"]
