import { Router } from 'express';
import { ScanRequest, ScanResponse, ViewMode } from '../../../shared/types';
import { AwsResourceScanner } from '../services/aws-scanner';
import { GraphBuilder } from '../services/graph-builder';

const router = Router();

router.post('/scan', async (req, res) => {
  try {
    const scanRequest: ScanRequest = req.body;
    
    // Validate request
    if (!scanRequest.credentials) {
      return res.status(400).json({
        success: false,
        error: 'Missing AWS credentials'
      } as ScanResponse);
    }

    const { accessKeyId, secretAccessKey, sessionToken, region } = scanRequest.credentials;
    
    if (!accessKeyId || !secretAccessKey || !region) {
      return res.status(400).json({
        success: false,
        error: 'Missing required credential fields: accessKeyId, secretAccessKey, region'
      } as ScanResponse);
    }

    console.log(`🔍 Starting AWS infrastructure scan for region: ${region}`);
    
    // Initialize AWS scanner with temporary credentials
    const scanner = new AwsResourceScanner(scanRequest.credentials);
    
    // Scan AWS resources
    const resources = await scanner.scanAllResources();
    console.log(`✅ Discovered ${resources.length} AWS resources`);
    
    // Build graph from resources - default to business flow for now
    const graphBuilder = new GraphBuilder(region);
    const graphData = await graphBuilder.buildBusinessFlowGraph(resources, region);
    
    console.log(`📊 Generated business flow graph with ${graphData.nodes.length} nodes and ${graphData.links.length} links`);
    
    const response: ScanResponse = {
      success: true,
      data: graphData
    };
    
    res.json(response);
    
  } catch (error) {
    console.error('Scan error:', error);
    
    const response: ScanResponse = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
    
    res.status(500).json(response);
  }
});

// Get available regions endpoint
router.get('/regions', (req, res) => {
  const awsRegions = [
    { code: 'us-east-1', name: 'US East (N. Virginia)' },
    { code: 'us-east-2', name: 'US East (Ohio)' },
    { code: 'us-west-1', name: 'US West (N. California)' },
    { code: 'us-west-2', name: 'US West (Oregon)' },
    { code: 'ap-south-1', name: 'Asia Pacific (Mumbai)' },
    { code: 'ap-southeast-1', name: 'Asia Pacific (Singapore)' },
    { code: 'ap-southeast-2', name: 'Asia Pacific (Sydney)' },
    { code: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)' },
    { code: 'eu-west-1', name: 'Europe (Ireland)' },
    { code: 'eu-central-1', name: 'Europe (Frankfurt)' },
    { code: 'ca-central-1', name: 'Canada (Central)' }
  ];
  
  res.json({ regions: awsRegions });
});

export { router as scanRoutes }; 