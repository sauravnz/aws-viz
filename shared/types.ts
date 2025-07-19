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

// Security Group Rule Types
export interface SecurityGroupRule {
  protocol: string; // tcp, udp, icmp, -1 (all)
  fromPort?: number;
  toPort?: number;
  cidrBlocks?: string[];
  sourceSecurityGroupId?: string;
  description?: string;
  direction: 'inbound' | 'outbound';
}

export interface SecurityGroupDetails {
  groupId: string;
  groupName: string;
  description: string;
  vpcId?: string;
  inboundRules: SecurityGroupRule[];
  outboundRules: SecurityGroupRule[];
}

// Network ACL Types
export interface NetworkAclRule {
  ruleNumber: number;
  protocol: string;
  ruleAction: 'allow' | 'deny';
  portRange?: {
    from?: number;
    to?: number;
  };
  cidrBlock: string;
  direction: 'inbound' | 'outbound';
}

export interface NetworkAclDetails {
  networkAclId: string;
  vpcId: string;
  isDefault: boolean;
  subnetIds: string[];
  rules: NetworkAclRule[];
}

// Zone Grouping Types
export interface ZoneGroup {
  id: string;
  name: string;
  type: 'vpc' | 'subnet' | 'availability-zone';
  cidrBlock?: string;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  color: string;
  children?: ZoneGroup[];
  resources: string[]; // Array of resource IDs
}

// Enhanced Link with Security Information
export interface SecurityAwareLink extends GraphLink {
  securityInfo?: {
    allowedPorts: string[];
    protocols: string[];
    direction: 'bidirectional' | 'source-to-target' | 'target-to-source';
    securityGroupIds: string[];
  };
}

// Enhanced Graph Data with Security Context
export interface SecurityAwareGraphData extends GraphData {
  links: SecurityAwareLink[];
  securityGroups: SecurityGroupDetails[];
  networkAcls: NetworkAclDetails[];
  zoneGroups: ZoneGroup[];
  metadata: GraphData['metadata'] & {
    securitySummary: {
      totalSecurityGroups: number;
      totalNacls: number;
      exposedPorts: string[];
      publicResources: number;
    };
  };
}

// Visualization View Modes
export enum ViewMode {
  BUSINESS_FLOW = 'business-flow',
  INFRASTRUCTURE_DETAIL = 'infrastructure-detail'
}

// Business Flow Specific Types
export interface BusinessFlowNode extends GraphNode {
  flowLayer: 'entry' | 'security' | 'compute' | 'data' | 'external';
  isBusinessCritical: boolean;
  publicAccess?: boolean;
}

export interface BusinessFlowLink extends GraphLink {
  flowType: 'traffic' | 'data' | 'management';
  isMainPath: boolean;
  protocols?: string[];
  ports?: string[];
}

export interface ContainerGroup {
  id: string;
  name: string;
  type: 'vpc' | 'subnet' | 'availability-zone';
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style: {
    fill?: string;
    stroke: string;
    strokeWidth: number;
    strokeDashArray?: string;
    opacity: number;
  };
  label: {
    text: string;
    subtext?: string;
    position: { x: number; y: number };
  };
  children?: ContainerGroup[];
  containedNodes: string[]; // Node IDs
}

export interface BusinessFlowGraphData extends GraphData {
  viewMode: ViewMode.BUSINESS_FLOW;
  nodes: BusinessFlowNode[];
  links: BusinessFlowLink[];
  containers: ContainerGroup[];
  flowPaths: {
    id: string;
    name: string;
    nodes: string[];
    description: string;
  }[];
  securityContext: {
    exposedServices: string[];
    publicResources: string[];
    securityGroups: SecurityGroupDetails[];
    criticalPaths: string[];
  };
  pricingData?: Record<string, {
    pricePerHour?: number;
    pricePerMonth?: number;
    pricePerGB?: number;
    currency: string;
    unit: string;
    instanceType?: string;
  }>;
}

export interface InfrastructureDetailGraphData extends SecurityAwareGraphData {
  viewMode: ViewMode.INFRASTRUCTURE_DETAIL;
}

// Visualization Config
export interface VisualizationConfig {
  viewMode: ViewMode;
  showSecurityGroups: boolean;
  showNetworkAcls: boolean;
  showZoneGrouping: boolean;
  showPortLabels: boolean;
  showDirectionalArrows: boolean;
  showContainers: boolean;
  textSpacing: number;
  nodeSpacing: number;
  layerSpacing: number;
  flowSpacing: number;
} 