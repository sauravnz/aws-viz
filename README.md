# 🏗️ AWS Infrastructure Visualizer

A full-stack web application that connects to your AWS account using temporary credentials and visualizes all AWS infrastructure resources using an interactive D3.js-powered diagram.

![AWS Viz Demo](https://via.placeholder.com/800x400/667eea/ffffff?text=AWS+Infrastructure+Visualization)

## ✨ Features

- **🔐 Secure Credential Handling**: Uses temporary AWS credentials (never stored)
- **📊 Interactive Visualization**: D3.js-powered force-directed graph with zoom, pan, and tooltips
- **🏢 Comprehensive Resource Discovery**: Scans EC2, S3, RDS, Lambda, VPC, networking, and IAM resources
- **🔗 Relationship Mapping**: Automatically discovers and visualizes relationships between resources
- **🎨 Color-Coded Service Types**: Easy identification with icons and color schemes
- **📱 Responsive Design**: Works on desktop and mobile devices
- **🐳 Containerized Deployment**: Docker and Docker Compose ready

## 🏗 Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React Client  │────│  Express API    │────│  AWS Services   │
│   (D3.js Viz)   │    │  (Node.js)      │    │  (EC2, S3, etc) │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Tech Stack

- **Frontend**: React 18, TypeScript, D3.js v7, Vite
- **Backend**: Node.js, Express.js, AWS SDK v3
- **Deployment**: Docker, Docker Compose
- **Security**: Helmet, CORS, temporary credential handling

## 📦 Project Structure

```
aws-viz/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── services/       # API client services
│   │   └── main.tsx       # Application entry point
│   ├── package.json
│   └── vite.config.ts
├── server/                 # Express backend application
│   ├── src/
│   │   ├── routes/         # API route handlers
│   │   ├── services/       # AWS scanning services
│   │   └── index.ts       # Server entry point
│   ├── package.json
│   └── tsconfig.json
├── shared/                 # Shared TypeScript types
│   └── types.ts
├── Dockerfile             # Multi-stage production build
├── docker-compose.yml     # Container orchestration
└── package.json          # Workspace configuration
```

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd aws-viz
   ```

2. **Build and run with Docker Compose**
   ```bash
   docker-compose up --build
   ```

3. **Access the application**
   Open your browser to `http://localhost:3000`

### Local Development

1. **Install dependencies**
   ```bash
   npm run install:all
   ```

2. **Start development servers**
   ```bash
   npm run dev
   ```
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:3001`

## 🔧 Configuration

### Environment Variables

The application supports the following environment variables:

```bash
# Server Configuration
PORT=3000                    # Server port (default: 3001 in dev, 3000 in prod)
NODE_ENV=production          # Environment mode
CORS_ORIGIN=*               # CORS allowed origins

# Client Configuration (Vite)
VITE_API_URL=/api           # API base URL for client
```

### AWS Permissions

The application requires the following AWS permissions:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "ec2:Describe*",
        "s3:ListBuckets",
        "s3:GetBucketLocation",
        "rds:Describe*",
        "lambda:List*",
        "lambda:Get*",
        "iam:List*",
        "iam:Get*",
        "elasticloadbalancing:Describe*"
      ],
      "Resource": "*"
    }
  ]
}
```

## 📊 Supported AWS Resources

| Service | Resources | Relationships |
|---------|-----------|---------------|
| **Compute** | EC2 Instances, Lambda Functions | VPC, Subnet, Security Groups, IAM Roles |
| **Storage** | S3 Buckets, EBS Volumes | EC2 attachment, Region-based |
| **Database** | RDS Instances | VPC, Subnet, Security Groups |
| **Networking** | VPC, Subnets, Route Tables, Gateways, Load Balancers | Hierarchical containment |
| **Security** | Security Groups, Network Interfaces | Instance associations |
| **IAM** | IAM Roles | Resource associations |

## 🔍 How It Works

1. **Credential Input**: User provides temporary AWS credentials through the web interface
2. **AWS Scanning**: Backend uses AWS SDK v3 to discover resources across multiple services
3. **Relationship Discovery**: Algorithm analyzes resource metadata to identify relationships
4. **Graph Generation**: Creates nodes and links representing the infrastructure
5. **D3.js Visualization**: Interactive force-directed graph with zoom, pan, and tooltips

## 🛡️ Security Features

- **No Persistent Storage**: Credentials are processed in-memory only
- **Temporary Credentials**: Designed for AWS STS temporary credentials
- **Input Validation**: Server-side validation of all inputs
- **CORS Protection**: Configurable CORS policy
- **Helmet Security**: Security headers and protections
- **Non-root Container**: Docker container runs as non-privileged user

## 🐳 Docker Deployment

### Production Deployment

```bash
# Build the image
docker build -t aws-viz .

# Run the container
docker run -p 3000:3000 aws-viz
```

### Docker Compose

```bash
# Production deployment
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 🔧 Development

### Available Scripts

```bash
# Root workspace commands
npm run dev              # Start both client and server in development
npm run build           # Build both client and server for production
npm run install:all     # Install dependencies for all workspaces

# Client-specific commands
npm run dev:client      # Start only the client development server
npm run build --workspace=client  # Build only the client

# Server-specific commands
npm run dev:server      # Start only the server development server
npm run build --workspace=server  # Build only the server
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scan` | Scan AWS infrastructure with provided credentials |
| `GET` | `/api/regions` | Get list of available AWS regions |
| `GET` | `/health` | Health check endpoint |

## 🎨 Visualization Features

- **Force-Directed Layout**: Automatic positioning based on relationships
- **Interactive Controls**: Zoom, pan, drag nodes
- **Tooltips**: Hover for detailed resource information
- **Click Details**: Click nodes for comprehensive metadata
- **Color Coding**: Different colors for each AWS service type
- **Icon Representation**: Emoji icons for easy resource identification
- **Legend**: Dynamic legend showing present resource types
- **Reset View**: Button to reset zoom and pan

## 🔧 Troubleshooting

### Common Issues

1. **AWS Credential Errors**
   - Ensure credentials have required permissions
   - Check region accessibility
   - Verify session token for temporary credentials

2. **Docker Build Issues**
   - Ensure Docker has sufficient memory (4GB recommended)
   - Clear Docker cache: `docker system prune -a`

3. **Network Issues**
   - Check CORS configuration for cross-origin requests
   - Verify port availability (3000, 3001)

### Logs

```bash
# Docker logs
docker-compose logs aws-viz

# Development logs
npm run dev  # Check console output
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Make your changes
4. Run tests: `npm test`
5. Commit changes: `git commit -am 'Add feature'`
6. Push to branch: `git push origin feature-name`
7. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [D3.js](https://d3js.org/) for the powerful visualization library
- [AWS SDK](https://aws.amazon.com/sdk-for-javascript/) for AWS integration
- [React](https://reactjs.org/) for the frontend framework
- [Express.js](https://expressjs.com/) for the backend framework

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Check the troubleshooting section above
- Review AWS documentation for credential setup

---

**⚠️ Security Notice**: This application is designed for temporary credential use. Never use long-term AWS access keys in production. Always follow AWS security best practices. 