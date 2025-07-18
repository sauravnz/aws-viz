// AWS Resource Types
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  region: string;
}

export interface AwsResource {
  id: string;
  name: string;
  type: ResourceType;
  region: string;
  arn?: string;
  tags?: Record<string, string>;
  metadata: Record<string, any>;
  vpcId?: string;
  subnetId?: string;
  availabilityZone?: string;
}

export enum ResourceType {
  // Compute
  EC2_INSTANCE = 'ec2-instance',
  LAMBDA_FUNCTION = 'lambda-function',
  EKS_CLUSTER = 'eks-cluster',
  EKS_NODEGROUP = 'eks-nodegroup',
  EKS_FARGATE_PROFILE = 'eks-fargate-profile',
  
  // Storage
  S3_BUCKET = 's3-bucket',
  EBS_VOLUME = 'ebs-volume',
  
  // Database
  RDS_INSTANCE = 'rds-instance',
  
  // Networking
  VPC = 'vpc',
  SUBNET = 'subnet',
  ROUTE_TABLE = 'route-table',
  INTERNET_GATEWAY = 'internet-gateway',
  NAT_GATEWAY = 'nat-gateway',
  SECURITY_GROUP = 'security-group',
  NETWORK_INTERFACE = 'network-interface',
  ELASTIC_LOAD_BALANCER = 'elastic-load-balancer',
  
  // IAM
  IAM_ROLE = 'iam-role'
}

export interface ResourceRelationship {
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  metadata?: Record<string, any>;
}

export enum RelationshipType {
  CONTAINS = 'contains',
  ATTACHED_TO = 'attached-to',
  ASSOCIATED_WITH = 'associated-with',
  ROUTES_TO = 'routes-to',
  USES = 'uses',
  MEMBER_OF = 'member-of',
  MANAGES = 'manages', // EKS cluster manages worker nodes
  RUNS_ON = 'runs-on'  // EKS workloads run on compute
}

export enum InfrastructureLayer {
  GATEWAY = 1,        // Internet Gateway, NAT Gateway
  LOAD_BALANCER = 2,  // ELB, Route Tables
  COMPUTE = 3,        // EC2, Lambda, EKS
  DATA = 4,          // RDS, S3, EBS
  FOUNDATION = 5     // VPC, Subnets, Security Groups, IAM
}

// Graph Data Structure
export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
  metadata: {
    scanTimestamp: string;
    region: string;
    totalResources: number;
    resourceCounts: Record<ResourceType, number>;
    layerCounts: Record<InfrastructureLayer, number>;
  };
}

export interface FilterOptions {
  layers: InfrastructureLayer[];
  serviceTypes: ResourceType[];
  showRelationships: boolean;
  groupByVpc: boolean;
}

export interface GraphNode {
  id: string;
  name: string;
  type: ResourceType;
  group: string; // VPC ID or 'global' for region-level resources
  layer: number; // Hierarchical layer (1-5)
  metadata: Record<string, any>;
  x?: number;
  y?: number;
  fx?: number;
  fy?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  type: RelationshipType;
  value: number; // strength of relationship
  metadata?: Record<string, any>;
}

// API Request/Response Types
export interface ScanRequest {
  credentials: AwsCredentials;
}

export interface ScanResponse {
  success: boolean;
  data?: GraphData;
  error?: string;
}

export interface ResourceGroup {
  id: string;
  name: string;
  type: 'vpc' | 'region' | 'availability-zone';
  resources: AwsResource[];
  children?: ResourceGroup[];
} 