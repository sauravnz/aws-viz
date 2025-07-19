import {
  AwsResource,
  ResourceType,
  GraphData,
  GraphNode,
  GraphLink,
  RelationshipType,
  ResourceRelationship,
  InfrastructureLayer,
  SecurityAwareGraphData,
  SecurityAwareLink,
  ZoneGroup,
  SecurityGroupDetails,
  NetworkAclDetails,
  ViewMode,
  BusinessFlowGraphData,
  BusinessFlowNode,
  BusinessFlowLink,
  ContainerGroup,
  InfrastructureDetailGraphData
} from '../../../shared/types';
import { AwsPricingService } from './pricing-service';

export class GraphBuilder {
  private pricingService: AwsPricingService;
  
  constructor(region: string = 'us-east-1') {
    this.pricingService = new AwsPricingService(region);
  }
  
  buildGraph(resources: AwsResource[], region: string): GraphData {
    const nodes = this.createNodes(resources);
    const links = this.createLinks(resources);
    const resourceCounts = this.calculateResourceCounts(resources);
    const layerCounts = this.calculateLayerCounts(nodes);

    return {
      nodes,
      links,
      metadata: {
        scanTimestamp: new Date().toISOString(),
        region,
        totalResources: resources.length,
        resourceCounts,
        layerCounts
      }
    };
  }

  buildSecurityAwareGraph(resources: AwsResource[], region: string): SecurityAwareGraphData {
    const nodes = this.createNodes(resources);
    const links = this.createSecurityAwareLinks(resources);
    const resourceCounts = this.calculateResourceCounts(resources);
    const layerCounts = this.calculateLayerCounts(nodes);
    const zoneGroups = this.createZoneGroups(resources);
    const securityGroups = this.extractSecurityGroupDetails(resources);
    const networkAcls = this.extractNetworkAclDetails(resources);

    // Calculate security summary
    const securitySummary = {
      totalSecurityGroups: securityGroups.length,
      totalNacls: networkAcls.length,
      exposedPorts: this.calculateExposedPorts(securityGroups),
      publicResources: this.countPublicResources(resources)
    };

    return {
      viewMode: ViewMode.INFRASTRUCTURE_DETAIL,
      nodes,
      links,
      securityGroups,
      networkAcls,
      zoneGroups,
      metadata: {
        scanTimestamp: new Date().toISOString(),
        region,
        totalResources: resources.length,
        resourceCounts,
        layerCounts,
        securitySummary
      }
    };
  }

  async buildBusinessFlowGraph(resources: AwsResource[], region: string): Promise<BusinessFlowGraphData> {
    // Filter to business-critical resources only
    const businessNodes = this.createBusinessFlowNodes(resources);
    const businessLinks = this.createBusinessFlowLinks(resources, businessNodes);
    const containers = this.createContainerGroups(resources, businessNodes);
    const flowPaths = this.identifyFlowPaths(businessNodes, businessLinks);
    const securityContext = this.buildSecurityContext(resources, businessNodes);
    
    // Fetch real pricing data for all business nodes
    console.log('💰 Fetching real AWS pricing data...');
    const pricingData = await this.fetchPricingForNodes(businessNodes, region);
    
    const resourceCounts = this.calculateResourceCounts(resources);
    const layerCounts = this.calculateLayerCounts(businessNodes);

    return {
      viewMode: ViewMode.BUSINESS_FLOW,
      nodes: businessNodes,
      links: businessLinks,
      containers,
      flowPaths,
      securityContext,
      metadata: {
        scanTimestamp: new Date().toISOString(),
        region,
        totalResources: businessNodes.length,
        resourceCounts,
        layerCounts
      },
      pricingData // Add real pricing data to the response
    };
  }

  private createNodes(resources: AwsResource[]): GraphNode[] {
    return resources.map(resource => ({
      id: resource.id,
      name: resource.name,
      type: resource.type,
      group: this.determineGroup(resource),
      layer: this.determineLayer(resource.type),
      metadata: {
        ...resource.metadata,
        region: resource.region,
        arn: resource.arn,
        tags: resource.tags,
        vpcId: resource.vpcId,
        subnetId: resource.subnetId,
        availabilityZone: resource.availabilityZone
      }
    }));
  }

  private createLinks(resources: AwsResource[]): GraphLink[] {
    const relationships = this.discoverRelationships(resources);
    return relationships.map(rel => ({
      source: rel.sourceId,
      target: rel.targetId,
      type: rel.type,
      value: this.getRelationshipStrength(rel.type),
      metadata: rel.metadata
    }));
  }

  private discoverRelationships(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // Create resource lookup map for efficiency
    const resourceMap = new Map<string, AwsResource>();
    resources.forEach(resource => resourceMap.set(resource.id, resource));

    // VPC containment relationships
    relationships.push(...this.findVpcContainments(resources));
    
    // Subnet containment relationships
    relationships.push(...this.findSubnetContainments(resources));
    
    // Security group associations
    relationships.push(...this.findSecurityGroupAssociations(resources));
    
    // Instance attachments (volumes, network interfaces)
    relationships.push(...this.findInstanceAttachments(resources));
    
    // Load balancer relationships
    relationships.push(...this.findLoadBalancerRelationships(resources));
    
    // IAM role associations
    relationships.push(...this.findIAMRoleAssociations(resources));
    
    // Gateway relationships
    relationships.push(...this.findGatewayRelationships(resources));
    
    // Route table associations
    relationships.push(...this.findRouteTableAssociations(resources));

    // EKS relationships
    relationships.push(...this.findEKSRelationships(resources));

    return relationships;
  }

  private findVpcContainments(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    const vpcs = resources.filter(r => r.type === ResourceType.VPC);
    
    vpcs.forEach(vpc => {
      // Find all resources within this VPC
      const vpcResources = resources.filter(r => 
        r.vpcId === vpc.id && r.id !== vpc.id
      );
      
      vpcResources.forEach(resource => {
        relationships.push({
          sourceId: vpc.id,
          targetId: resource.id,
          type: RelationshipType.CONTAINS,
          metadata: { vpcId: vpc.id }
        });
      });
    });
    
    return relationships;
  }

  private findSubnetContainments(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    const subnets = resources.filter(r => r.type === ResourceType.SUBNET);
    
    subnets.forEach(subnet => {
      // Find all resources within this subnet
      const subnetResources = resources.filter(r => 
        r.subnetId === subnet.id && r.id !== subnet.id
      );
      
      subnetResources.forEach(resource => {
        relationships.push({
          sourceId: subnet.id,
          targetId: resource.id,
          type: RelationshipType.CONTAINS,
          metadata: { subnetId: subnet.id }
        });
      });
    });
    
    return relationships;
  }

  private findSecurityGroupAssociations(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // Find EC2 instances with security groups
    const instances = resources.filter(r => r.type === ResourceType.EC2_INSTANCE);
    
    instances.forEach(instance => {
      const securityGroupIds = instance.metadata.securityGroupIds as string[] || [];
      
      securityGroupIds.forEach(sgId => {
        relationships.push({
          sourceId: sgId,
          targetId: instance.id,
          type: RelationshipType.ASSOCIATED_WITH,
          metadata: { associationType: 'security-group' }
        });
      });
    });
    
    return relationships;
  }

  private findInstanceAttachments(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // EBS Volume attachments
    const volumes = resources.filter(r => r.type === ResourceType.EBS_VOLUME);
    volumes.forEach(volume => {
      const attachments = volume.metadata.attachments as Array<{instanceId: string}> || [];
      attachments.forEach(attachment => {
        if (attachment.instanceId) {
          relationships.push({
            sourceId: volume.id,
            targetId: attachment.instanceId,
            type: RelationshipType.ATTACHED_TO,
            metadata: { attachmentType: 'ebs-volume' }
          });
        }
      });
    });
    
    // Network Interface attachments
    const networkInterfaces = resources.filter(r => r.type === ResourceType.NETWORK_INTERFACE);
    networkInterfaces.forEach(eni => {
      const attachment = eni.metadata.attachment as {instanceId?: string} | null;
      if (attachment?.instanceId) {
        relationships.push({
          sourceId: eni.id,
          targetId: attachment.instanceId,
          type: RelationshipType.ATTACHED_TO,
          metadata: { attachmentType: 'network-interface' }
        });
      }
    });
    
    return relationships;
  }

  private findLoadBalancerRelationships(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // Load balancers are associated with subnets
    const loadBalancers = resources.filter(r => r.type === ResourceType.ELASTIC_LOAD_BALANCER);
    const subnets = resources.filter(r => r.type === ResourceType.SUBNET);
    
    loadBalancers.forEach(lb => {
      const availabilityZones = lb.metadata.availabilityZones as string[] || [];
      
      // Find subnets in the same AZs as the load balancer
      subnets.forEach(subnet => {
        if (lb.vpcId === subnet.vpcId && availabilityZones.includes(subnet.availabilityZone || '')) {
          relationships.push({
            sourceId: lb.id,
            targetId: subnet.id,
            type: RelationshipType.USES,
            metadata: { usageType: 'load-balancer-subnet' }
          });
        }
      });
    });
    
    return relationships;
  }

  private findIAMRoleAssociations(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // EC2 instances with IAM instance profiles
    const instances = resources.filter(r => r.type === ResourceType.EC2_INSTANCE);
    const roles = resources.filter(r => r.type === ResourceType.IAM_ROLE);
    
    instances.forEach(instance => {
      const iamProfileArn = instance.metadata.iamInstanceProfile as string;
      if (iamProfileArn) {
        // Extract role name from ARN
        const roleArnMatch = iamProfileArn.match(/arn:aws:iam::\d+:instance-profile\/(.+)/);
        if (roleArnMatch) {
          const roleName = roleArnMatch[1];
          const role = roles.find(r => r.name === roleName);
          if (role) {
            relationships.push({
              sourceId: role.id,
              targetId: instance.id,
              type: RelationshipType.ASSOCIATED_WITH,
              metadata: { associationType: 'iam-role' }
            });
          }
        }
      }
    });
    
    // Lambda functions with IAM roles
    const lambdaFunctions = resources.filter(r => r.type === ResourceType.LAMBDA_FUNCTION);
    lambdaFunctions.forEach(func => {
      const roleArn = func.metadata.role as string;
      if (roleArn) {
        const roleArnMatch = roleArn.match(/arn:aws:iam::\d+:role\/(.+)/);
        if (roleArnMatch) {
          const roleName = roleArnMatch[1];
          const role = roles.find(r => r.name === roleName);
          if (role) {
            relationships.push({
              sourceId: role.id,
              targetId: func.id,
              type: RelationshipType.ASSOCIATED_WITH,
              metadata: { associationType: 'iam-role' }
            });
          }
        }
      }
    });
    
    return relationships;
  }

  private findGatewayRelationships(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // Internet Gateway attachments to VPCs
    const internetGateways = resources.filter(r => r.type === ResourceType.INTERNET_GATEWAY);
    internetGateways.forEach(igw => {
      if (igw.vpcId) {
        relationships.push({
          sourceId: igw.id,
          targetId: igw.vpcId,
          type: RelationshipType.ATTACHED_TO,
          metadata: { attachmentType: 'internet-gateway' }
        });
      }
    });
    
    // NAT Gateway relationships
    const natGateways = resources.filter(r => r.type === ResourceType.NAT_GATEWAY);
    natGateways.forEach(nat => {
      if (nat.subnetId) {
        relationships.push({
          sourceId: nat.id,
          targetId: nat.subnetId,
          type: RelationshipType.USES,
          metadata: { usageType: 'nat-gateway-subnet' }
        });
      }
    });
    
    return relationships;
  }

  private findRouteTableAssociations(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    // Route tables are associated with VPCs
    const routeTables = resources.filter(r => r.type === ResourceType.ROUTE_TABLE);
    routeTables.forEach(rt => {
      if (rt.vpcId) {
        relationships.push({
          sourceId: rt.id,
          targetId: rt.vpcId,
          type: RelationshipType.MEMBER_OF,
          metadata: { membershipType: 'route-table' }
        });
      }
    });
    
    return relationships;
  }

  private findEKSRelationships(resources: AwsResource[]): ResourceRelationship[] {
    const relationships: ResourceRelationship[] = [];
    
    const eksClusters = resources.filter(r => r.type === ResourceType.EKS_CLUSTER);
    const eksNodegroups = resources.filter(r => r.type === ResourceType.EKS_NODEGROUP);
    const eksFargateProfiles = resources.filter(r => r.type === ResourceType.EKS_FARGATE_PROFILE);
    const ec2Instances = resources.filter(r => r.type === ResourceType.EC2_INSTANCE);
    
    // EKS Cluster → Nodegroups
    eksNodegroups.forEach(nodegroup => {
      const clusterName = nodegroup.metadata.clusterName as string;
      const cluster = eksClusters.find(c => c.name === clusterName);
      if (cluster) {
        relationships.push({
          sourceId: cluster.id,
          targetId: nodegroup.id,
          type: RelationshipType.MANAGES,
          metadata: { relationshipType: 'cluster-nodegroup' }
        });
      }
    });
    
    // EKS Cluster → Fargate Profiles
    eksFargateProfiles.forEach(fargateProfile => {
      const clusterName = fargateProfile.metadata.clusterName as string;
      const cluster = eksClusters.find(c => c.name === clusterName);
      if (cluster) {
        relationships.push({
          sourceId: cluster.id,
          targetId: fargateProfile.id,
          type: RelationshipType.MANAGES,
          metadata: { relationshipType: 'cluster-fargate' }
        });
      }
    });
    
    // Nodegroup → EC2 Instances (for instances that are part of nodegroups)
    eksNodegroups.forEach(nodegroup => {
      // Check if EC2 instances belong to this nodegroup based on tags or metadata
      ec2Instances.forEach(instance => {
        const instanceTags = instance.tags || {};
        const nodegroupName = nodegroup.name;
        const clusterName = nodegroup.metadata.clusterName as string;
        
        // Look for standard EKS tags on the instance
        if (instanceTags['kubernetes.io/cluster/' + clusterName] === 'owned' &&
            instanceTags['eks:nodegroup-name'] === nodegroupName) {
          relationships.push({
            sourceId: nodegroup.id,
            targetId: instance.id,
            type: RelationshipType.RUNS_ON,
            metadata: { relationshipType: 'nodegroup-instance' }
          });
        }
      });
    });
    
    return relationships;
  }

  private determineGroup(resource: AwsResource): string {
    // Group resources by VPC, or 'global' for region-level resources
    if (resource.vpcId) {
      return resource.vpcId;
    }
    
    if (resource.type === ResourceType.S3_BUCKET || 
        resource.type === ResourceType.IAM_ROLE ||
        resource.type === ResourceType.LAMBDA_FUNCTION) {
      return 'global';
    }
    
    return resource.region;
  }

  private determineLayer(resourceType: ResourceType): number {
    switch (resourceType) {
      // Layer 1: Gateways
      case ResourceType.INTERNET_GATEWAY:
      case ResourceType.NAT_GATEWAY:
        return InfrastructureLayer.GATEWAY;

      // Layer 2: Load Balancers and Routing
      case ResourceType.ELASTIC_LOAD_BALANCER:
      case ResourceType.ROUTE_TABLE:
        return InfrastructureLayer.LOAD_BALANCER;

      // Layer 3: Compute
      case ResourceType.EC2_INSTANCE:
      case ResourceType.LAMBDA_FUNCTION:
      case ResourceType.EKS_CLUSTER:
      case ResourceType.EKS_NODEGROUP:
      case ResourceType.EKS_FARGATE_PROFILE:
        return InfrastructureLayer.COMPUTE;

      // Layer 4: Data
      case ResourceType.RDS_INSTANCE:
      case ResourceType.S3_BUCKET:
      case ResourceType.EBS_VOLUME:
        return InfrastructureLayer.DATA;

      // Layer 5: Foundation
      case ResourceType.VPC:
      case ResourceType.SUBNET:
      case ResourceType.SECURITY_GROUP:
      case ResourceType.NETWORK_INTERFACE:
      case ResourceType.IAM_ROLE:
        return InfrastructureLayer.FOUNDATION;

      default:
        return InfrastructureLayer.FOUNDATION;
    }
  }

  private async fetchPricingForNodes(nodes: BusinessFlowNode[], region: string): Promise<Record<string, any>> {
    const pricingData: Record<string, any> = {};
    
    try {
      // Create list of unique resource types with their instance types
      const resourcesToPrice = nodes.map(node => ({
        type: node.type,
        region,
        instanceType: this.extractInstanceType(node)
      }));
      
      // Fetch pricing data in bulk
      const bulkPricing = await this.pricingService.getBulkResourcePricing(resourcesToPrice);
      
      // Map pricing data by node ID
      nodes.forEach(node => {
        const instanceType = this.extractInstanceType(node);
        const key = `${node.type}-${region}-${instanceType || 'default'}`;
        
        if (bulkPricing[key]) {
          pricingData[node.id] = {
            ...bulkPricing[key],
            instanceType
          };
        }
      });
      
      console.log(`💰 Fetched pricing for ${Object.keys(pricingData).length} resources`);
      return pricingData;
      
    } catch (error) {
      console.error('💰 Error fetching pricing data:', error);
      return {};
    }
  }
  
  private extractInstanceType(node: BusinessFlowNode): string | undefined {
    // Extract instance type from metadata for precise pricing
    if (node.type === ResourceType.EC2_INSTANCE) {
      return node.metadata.instanceType as string || 't3.medium';
    }
    if (node.type === ResourceType.RDS_INSTANCE) {
      return node.metadata.instanceClass as string || 'db.t3.micro';
    }
    return undefined;
  }

  private calculateLayerCounts(nodes: GraphNode[]): Record<InfrastructureLayer, number> {
    const counts = {} as Record<InfrastructureLayer, number>;
    
    // Initialize all layers with 0
    Object.values(InfrastructureLayer).forEach(layer => {
      if (typeof layer === 'number') {
        counts[layer] = 0;
      }
    });
    
    // Count nodes by layer
    nodes.forEach(node => {
      counts[node.layer] = (counts[node.layer] || 0) + 1;
    });
    
    return counts;
  }

  private getRelationshipStrength(type: RelationshipType): number {
    // Assign different strengths to different relationship types
    switch (type) {
      case RelationshipType.CONTAINS:
        return 3;
      case RelationshipType.MANAGES:
        return 3; // EKS cluster manages nodes/fargate
      case RelationshipType.ATTACHED_TO:
        return 2;
      case RelationshipType.ASSOCIATED_WITH:
        return 2;
      case RelationshipType.RUNS_ON:
        return 2; // EKS workloads run on compute
      case RelationshipType.USES:
        return 1;
      case RelationshipType.MEMBER_OF:
        return 1;
      case RelationshipType.ROUTES_TO:
        return 1;
      default:
        return 1;
    }
  }

  private calculateResourceCounts(resources: AwsResource[]): Record<ResourceType, number> {
    const counts = {} as Record<ResourceType, number>;
    
    // Initialize all resource types with 0
    Object.values(ResourceType).forEach(type => {
      counts[type] = 0;
    });
    
    // Count actual resources
    resources.forEach(resource => {
      counts[resource.type] = (counts[resource.type] || 0) + 1;
    });
    
    return counts;
  }

  private createSecurityAwareLinks(resources: AwsResource[]): SecurityAwareLink[] {
    const relationships = this.discoverRelationships(resources);
    const securityGroupMap = new Map<string, any>();
    
    // Build security group lookup
    resources.filter(r => r.type === ResourceType.SECURITY_GROUP).forEach(sg => {
      securityGroupMap.set(sg.id, sg.metadata.detailedRules || { inbound: [], outbound: [] });
    });

    return relationships.map(rel => {
      const link: SecurityAwareLink = {
        source: rel.sourceId,
        target: rel.targetId,
        type: rel.type,
        value: 1,
        metadata: rel.metadata
      };

      // Add security information for relevant relationships
      if (rel.type === RelationshipType.ASSOCIATED_WITH && rel.metadata?.associationType === 'security-group') {
        const sgRules = securityGroupMap.get(rel.sourceId);
        if (sgRules) {
          link.securityInfo = {
            allowedPorts: this.extractPortsFromRules(sgRules.inbound.concat(sgRules.outbound)),
            protocols: this.extractProtocolsFromRules(sgRules.inbound.concat(sgRules.outbound)),
            direction: 'bidirectional',
            securityGroupIds: [rel.sourceId]
          };
        }
      }

      return link;
    });
  }

  private createZoneGroups(resources: AwsResource[]): ZoneGroup[] {
    const zoneGroups: ZoneGroup[] = [];
    const vpcGroups = new Map<string, AwsResource[]>();
    const subnetGroups = new Map<string, AwsResource[]>();

    // Group resources by VPC and Subnet
    resources.forEach(resource => {
      if (resource.vpcId) {
        if (!vpcGroups.has(resource.vpcId)) {
          vpcGroups.set(resource.vpcId, []);
        }
        vpcGroups.get(resource.vpcId)!.push(resource);
      }

      if (resource.subnetId) {
        if (!subnetGroups.has(resource.subnetId)) {
          subnetGroups.set(resource.subnetId, []);
        }
        subnetGroups.get(resource.subnetId)!.push(resource);
      }
    });

    // Create VPC zone groups
    let groupIndex = 0;
    vpcGroups.forEach((vpcResources, vpcId) => {
      const vpc = vpcResources.find(r => r.type === ResourceType.VPC);
      const bounds = this.calculateBounds(vpcResources, groupIndex, 'vpc');
      
      zoneGroups.push({
        id: vpcId,
        name: vpc?.name || vpcId,
        type: 'vpc',
        cidrBlock: vpc?.metadata.cidrBlock,
        bounds,
        color: this.getVpcColor(groupIndex),
        resources: vpcResources.map(r => r.id),
        children: []
      });
      groupIndex++;
    });

    // Create Subnet zone groups within VPCs
    subnetGroups.forEach((subnetResources, subnetId) => {
      const subnet = subnetResources.find(r => r.type === ResourceType.SUBNET);
      if (subnet) {
        const parentVpcGroup = zoneGroups.find(zg => zg.id === subnet.vpcId);
        if (parentVpcGroup) {
          const bounds = this.calculateBounds(subnetResources, 0, 'subnet', parentVpcGroup.bounds);
          
          const subnetGroup: ZoneGroup = {
            id: subnetId,
            name: subnet.name || subnetId,
            type: 'subnet',
            cidrBlock: subnet.metadata.cidrBlock,
            bounds,
            color: this.getSubnetColor(subnet.metadata.mapPublicIpOnLaunch),
            resources: subnetResources.map(r => r.id)
          };

          if (!parentVpcGroup.children) {
            parentVpcGroup.children = [];
          }
          parentVpcGroup.children.push(subnetGroup);
        }
      }
    });

    return zoneGroups;
  }

  private extractSecurityGroupDetails(resources: AwsResource[]): SecurityGroupDetails[] {
    return resources
      .filter(r => r.type === ResourceType.SECURITY_GROUP)
      .map(sg => ({
        groupId: sg.id,
        groupName: sg.name,
        description: sg.metadata.description || '',
        vpcId: sg.vpcId || '',
        inboundRules: sg.metadata.detailedRules?.inbound || [],
        outboundRules: sg.metadata.detailedRules?.outbound || []
      }));
  }

  private extractNetworkAclDetails(resources: AwsResource[]): NetworkAclDetails[] {
    return resources
      .filter(r => r.metadata.isDefault !== undefined) // NACL resources
      .map(nacl => ({
        networkAclId: nacl.id,
        vpcId: nacl.vpcId || '',
        isDefault: nacl.metadata.isDefault || false,
        subnetIds: nacl.metadata.associatedSubnets || [],
        rules: nacl.metadata.detailedRules || []
      }));
  }

  private calculateExposedPorts(securityGroups: SecurityGroupDetails[]): string[] {
    const exposedPorts = new Set<string>();
    
    securityGroups.forEach(sg => {
      sg.inboundRules.forEach(rule => {
        if (rule.cidrBlocks?.includes('0.0.0.0/0')) {
          if (rule.fromPort && rule.toPort) {
            if (rule.fromPort === rule.toPort) {
              exposedPorts.add(`${rule.protocol}/${rule.fromPort}`);
            } else {
              exposedPorts.add(`${rule.protocol}/${rule.fromPort}-${rule.toPort}`);
            }
          } else {
            exposedPorts.add(rule.protocol);
          }
        }
      });
    });

    return Array.from(exposedPorts);
  }

  private countPublicResources(resources: AwsResource[]): number {
    return resources.filter(r => {
      // Count resources that might be publicly accessible
      return r.type === ResourceType.ELASTIC_LOAD_BALANCER ||
             r.type === ResourceType.INTERNET_GATEWAY ||
             (r.type === ResourceType.EC2_INSTANCE && r.metadata.publicIpAddress) ||
             (r.type === ResourceType.S3_BUCKET);
    }).length;
  }

  private extractPortsFromRules(rules: any[]): string[] {
    const ports = new Set<string>();
    rules.forEach(rule => {
      if (rule.fromPort && rule.toPort) {
        if (rule.fromPort === rule.toPort) {
          ports.add(rule.fromPort.toString());
        } else {
          ports.add(`${rule.fromPort}-${rule.toPort}`);
        }
      }
    });
    return Array.from(ports);
  }

  private extractProtocolsFromRules(rules: any[]): string[] {
    const protocols = new Set<string>();
    rules.forEach(rule => {
      protocols.add(rule.protocol);
    });
    return Array.from(protocols);
  }

  private calculateBounds(resources: AwsResource[], index: number, type: 'vpc' | 'subnet', parentBounds?: any): any {
    // Simple layout calculation - in a real implementation this would be more sophisticated
    const baseWidth = type === 'vpc' ? 400 : 200;
    const baseHeight = type === 'vpc' ? 300 : 150;
    
    if (type === 'vpc') {
      return {
        x: index * 450,
        y: 50,
        width: baseWidth,
        height: baseHeight
      };
    } else {
      // Subnet bounds within VPC
      return {
        x: (parentBounds?.x || 0) + 20,
        y: (parentBounds?.y || 0) + 40 + (index * 80),
        width: baseWidth,
        height: baseHeight / 2
      };
    }
  }

  private getVpcColor(index: number): string {
    const colors = ['#E3F2FD', '#F3E5F5', '#E8F5E8', '#FFF3E0', '#FCE4EC'];
    return colors[index % colors.length];
  }

  private getSubnetColor(isPublic: boolean): string {
    return isPublic ? '#FFE0B2' : '#E1F5FE';
  }

  // Business Flow Graph Methods
  private createBusinessFlowNodes(resources: AwsResource[]): BusinessFlowNode[] {
    const businessNodes: BusinessFlowNode[] = [];
    
    console.log(`🔍 Processing ${resources.length} resources for business flow`);
    const resourceTypes = new Set(resources.map(r => r.type));
    console.log(`📋 Resource types found:`, Array.from(resourceTypes));
    
    resources.forEach(resource => {
      // Only include business-critical resources
      if (this.isBusinessCritical(resource)) {
        const baseNode = this.createNodeFromResource(resource);
        
        const businessNode: BusinessFlowNode = {
          ...baseNode,
          flowLayer: this.determineFlowLayer(resource),
          isBusinessCritical: true,
          publicAccess: this.hasPublicAccess(resource)
        };
        
        businessNodes.push(businessNode);
      }
    });

    console.log(`✅ Created ${businessNodes.length} business flow nodes`);
    return businessNodes;
  }

  private createBusinessFlowLinks(resources: AwsResource[], nodes: BusinessFlowNode[]): BusinessFlowLink[] {
    const businessLinks: BusinessFlowLink[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));
    
    // Create traffic flow connections (not infrastructure relationships)
    const trafficFlows = this.identifyTrafficFlows(resources, nodeIds);
    
    trafficFlows.forEach(flow => {
      const businessLink: BusinessFlowLink = {
        source: flow.sourceId,
        target: flow.targetId,
        type: flow.type,
        value: flow.weight || 1,
        flowType: flow.flowType,
        isMainPath: flow.isMainPath,
        protocols: flow.protocols,
        ports: flow.ports,
        metadata: flow.metadata
      };
      
      businessLinks.push(businessLink);
    });

    return businessLinks;
  }

  private createContainerGroups(resources: AwsResource[], nodes: BusinessFlowNode[]): ContainerGroup[] {
    const containers: ContainerGroup[] = [];
    const vpcGroups = new Map<string, AwsResource[]>();
    
    // Group resources by VPC
    resources.forEach(resource => {
      if (resource.vpcId) {
        if (!vpcGroups.has(resource.vpcId)) {
          vpcGroups.set(resource.vpcId, []);
        }
        vpcGroups.get(resource.vpcId)!.push(resource);
      }
    });

    // Create VPC containers
    vpcGroups.forEach((vpcResources, vpcId) => {
      const vpc = vpcResources.find(r => r.type === ResourceType.VPC);
      const containedNodes = nodes.filter(n => n.metadata.vpcId === vpcId).map(n => n.id);
      
      if (containedNodes.length > 0) {
        containers.push({
          id: vpcId,
          name: vpc?.name || vpcId,
          type: 'vpc',
          bounds: { x: 0, y: 0, width: 0, height: 0 }, // Will be calculated in layout
          style: {
            stroke: '#9C27B0',
            strokeWidth: 2,
            strokeDashArray: '5,5',
            opacity: 0.3,
            fill: '#F3E5F5'
          },
          label: {
            text: `VPC: ${vpc?.name || vpcId}`,
            subtext: vpc?.metadata.cidrBlock,
            position: { x: 0, y: 0 }
          },
          containedNodes
        });
      }
    });

    return containers;
  }

  private identifyFlowPaths(nodes: BusinessFlowNode[], links: BusinessFlowLink[]): Array<{id: string, name: string, nodes: string[], description: string}> {
    const flowPaths: Array<{id: string, name: string, nodes: string[], description: string}> = [];
    
    // Find entry points (Internet Gateways, Load Balancers)
    const entryPoints = nodes.filter(n => n.flowLayer === 'entry');
    
    entryPoints.forEach(entry => {
      const path = this.traceFlowPath(entry.id, links, nodes);
      if (path.length > 1) {
        flowPaths.push({
          id: `flow-${entry.id}`,
          name: `Traffic Flow via ${entry.name}`,
          nodes: path,
          description: `User traffic entering through ${entry.name}`
        });
      }
    });

    return flowPaths;
  }

  private buildSecurityContext(resources: AwsResource[], nodes: BusinessFlowNode[]): any {
    const securityGroups = this.extractSecurityGroupDetails(resources);
    const exposedServices = nodes.filter(n => n.publicAccess).map(n => n.id);
    const publicResources = resources.filter(r => this.hasPublicAccess(r)).map(r => r.id);
    const criticalPaths = nodes.filter(n => n.isBusinessCritical && n.flowLayer === 'compute').map(n => n.id);

    return {
      exposedServices,
      publicResources,
      securityGroups,
      criticalPaths
    };
  }

  // Helper methods for business flow logic
  private isBusinessCritical(resource: AwsResource): boolean {
    const businessCriticalTypes = [
      ResourceType.INTERNET_GATEWAY,
      ResourceType.ELASTIC_LOAD_BALANCER,
      ResourceType.EC2_INSTANCE,
      ResourceType.EKS_CLUSTER,
      ResourceType.LAMBDA_FUNCTION,
      ResourceType.RDS_INSTANCE,
      ResourceType.S3_BUCKET,
      ResourceType.NAT_GATEWAY,
      // Temporarily include more types for debugging
      ResourceType.VPC,
      ResourceType.SUBNET,
      ResourceType.SECURITY_GROUP
    ];
    
    console.log(`🔍 Checking if ${resource.type} (${resource.name}) is business critical:`, businessCriticalTypes.includes(resource.type));
    return businessCriticalTypes.includes(resource.type);
  }

  private determineFlowLayer(resource: AwsResource): 'entry' | 'security' | 'compute' | 'data' | 'external' {
    switch (resource.type) {
      case ResourceType.INTERNET_GATEWAY:
        return 'entry';
      case ResourceType.ELASTIC_LOAD_BALANCER:
      case ResourceType.NAT_GATEWAY:
        return 'security';
      case ResourceType.EC2_INSTANCE:
      case ResourceType.EKS_CLUSTER:
      case ResourceType.LAMBDA_FUNCTION:
        return 'compute';
      case ResourceType.RDS_INSTANCE:
      case ResourceType.S3_BUCKET:
        return 'data';
      default:
        return 'external';
    }
  }

  private hasPublicAccess(resource: AwsResource): boolean {
    return !!(
      resource.metadata.publicIpAddress ||
      resource.type === ResourceType.INTERNET_GATEWAY ||
      resource.type === ResourceType.ELASTIC_LOAD_BALANCER ||
      (resource.type === ResourceType.S3_BUCKET)
    );
  }

  private identifyTrafficFlows(resources: AwsResource[], businessNodeIds: Set<string>): Array<any> {
    const flows: Array<any> = [];
    
    // Internet Gateway -> Load Balancer flows
    const igws = resources.filter(r => r.type === ResourceType.INTERNET_GATEWAY && businessNodeIds.has(r.id));
    const albs = resources.filter(r => r.type === ResourceType.ELASTIC_LOAD_BALANCER && businessNodeIds.has(r.id));
    
    igws.forEach(igw => {
      albs.forEach(alb => {
        if (igw.vpcId === alb.vpcId) {
          flows.push({
            sourceId: igw.id,
            targetId: alb.id,
            type: RelationshipType.ROUTES_TO,
            flowType: 'traffic',
            isMainPath: true,
            protocols: ['HTTP', 'HTTPS'],
            ports: ['80', '443'],
            weight: 3,
            metadata: { flowDescription: 'Internet traffic to load balancer' }
          });
        }
      });
    });

    // Load Balancer -> EC2/EKS flows
    albs.forEach(alb => {
      const computeResources = resources.filter(r => 
        (r.type === ResourceType.EC2_INSTANCE || r.type === ResourceType.EKS_CLUSTER) && 
        businessNodeIds.has(r.id) && 
        r.vpcId === alb.vpcId
      );
      
      computeResources.forEach(compute => {
        flows.push({
          sourceId: alb.id,
          targetId: compute.id,
          type: RelationshipType.ROUTES_TO,
          flowType: 'traffic',
          isMainPath: true,
          protocols: ['HTTP'],
          ports: ['8080', '3000'],
          weight: 2,
          metadata: { flowDescription: 'Load balancer distributing to compute' }
        });
      });
    });

    // Compute -> Data flows
    const computeResources = resources.filter(r => 
      (r.type === ResourceType.EC2_INSTANCE || r.type === ResourceType.EKS_CLUSTER || r.type === ResourceType.LAMBDA_FUNCTION) && 
      businessNodeIds.has(r.id)
    );
    
    const dataResources = resources.filter(r => 
      (r.type === ResourceType.RDS_INSTANCE || r.type === ResourceType.S3_BUCKET) && 
      businessNodeIds.has(r.id)
    );

    computeResources.forEach(compute => {
      dataResources.forEach(data => {
        if (compute.vpcId === data.vpcId || data.type === ResourceType.S3_BUCKET) {
          flows.push({
            sourceId: compute.id,
            targetId: data.id,
            type: RelationshipType.USES,
            flowType: 'data',
            isMainPath: true,
            protocols: data.type === ResourceType.RDS_INSTANCE ? ['TCP'] : ['HTTPS'],
            ports: data.type === ResourceType.RDS_INSTANCE ? ['5432', '3306'] : ['443'],
            weight: 1,
            metadata: { flowDescription: 'Application accessing data store' }
          });
        }
      });
    });

    return flows;
  }

  private traceFlowPath(startNodeId: string, links: BusinessFlowLink[], nodes: BusinessFlowNode[]): string[] {
    const path = [startNodeId];
    const visited = new Set([startNodeId]);
    
    let currentNode = startNodeId;
    
    while (true) {
      const nextLink = links.find(l => l.source === currentNode && !visited.has(l.target));
      if (!nextLink) break;
      
      path.push(nextLink.target);
      visited.add(nextLink.target);
      currentNode = nextLink.target;
    }
    
    return path;
  }

  private createNodeFromResource(resource: AwsResource): GraphNode {
    return {
      id: resource.id,
      name: resource.name,
      type: resource.type,
      group: resource.vpcId || 'global',
      layer: this.getInfrastructureLayer(resource.type),
      metadata: resource.metadata
    };
  }

  private getInfrastructureLayer(resourceType: ResourceType): InfrastructureLayer {
    switch (resourceType) {
      case ResourceType.INTERNET_GATEWAY:
      case ResourceType.NAT_GATEWAY:
        return InfrastructureLayer.GATEWAY;
      
      case ResourceType.ELASTIC_LOAD_BALANCER:
      case ResourceType.ROUTE_TABLE:
        return InfrastructureLayer.LOAD_BALANCER;
      
      case ResourceType.EC2_INSTANCE:
      case ResourceType.EKS_CLUSTER:
      case ResourceType.EKS_NODEGROUP:
      case ResourceType.EKS_FARGATE_PROFILE:
      case ResourceType.LAMBDA_FUNCTION:
        return InfrastructureLayer.COMPUTE;
      
      case ResourceType.RDS_INSTANCE:
      case ResourceType.S3_BUCKET:
      case ResourceType.EBS_VOLUME:
        return InfrastructureLayer.DATA;
      
      case ResourceType.VPC:
      case ResourceType.SUBNET:
      case ResourceType.SECURITY_GROUP:
      case ResourceType.NETWORK_INTERFACE:
      case ResourceType.IAM_ROLE:
      default:
        return InfrastructureLayer.FOUNDATION;
    }
  }
} 