import {
  AwsResource,
  ResourceType,
  GraphData,
  GraphNode,
  GraphLink,
  RelationshipType,
  ResourceRelationship,
  InfrastructureLayer
} from '../../../shared/types';

export class GraphBuilder {
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
} 