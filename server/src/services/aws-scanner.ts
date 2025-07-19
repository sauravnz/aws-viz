import {
  EC2Client,
  DescribeInstancesCommand,
  DescribeVpcsCommand,
  DescribeSubnetsCommand,
  DescribeRouteTablesCommand,
  DescribeInternetGatewaysCommand,
  DescribeNatGatewaysCommand,
  DescribeSecurityGroupsCommand,
  DescribeNetworkInterfacesCommand,
  DescribeVolumesCommand,
  DescribeNetworkAclsCommand
} from '@aws-sdk/client-ec2';
import { S3Client, ListBucketsCommand, GetBucketLocationCommand } from '@aws-sdk/client-s3';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { LambdaClient, ListFunctionsCommand, GetFunctionCommand } from '@aws-sdk/client-lambda';
import { IAMClient, ListRolesCommand, GetRoleCommand } from '@aws-sdk/client-iam';
import { ElasticLoadBalancingV2Client, DescribeLoadBalancersCommand } from '@aws-sdk/client-elastic-load-balancing-v2';
import { EKSClient, ListClustersCommand, DescribeClusterCommand, ListNodegroupsCommand, DescribeNodegroupCommand, ListFargateProfilesCommand, DescribeFargateProfileCommand } from '@aws-sdk/client-eks';

import { AwsCredentials, AwsResource, ResourceType, SecurityGroupDetails, SecurityGroupRule, NetworkAclDetails, NetworkAclRule } from '../../../shared/types';

export class AwsResourceScanner {
  private ec2Client: EC2Client;
  private s3Client: S3Client;
  private rdsClient: RDSClient;
  private lambdaClient: LambdaClient;
  private iamClient: IAMClient;
  private elbClient: ElasticLoadBalancingV2Client;
  private eksClient: EKSClient;
  private region: string;

  constructor(credentials: AwsCredentials) {
    this.region = credentials.region;
    
    const awsConfig = {
      region: credentials.region,
      credentials: {
        accessKeyId: credentials.accessKeyId,
        secretAccessKey: credentials.secretAccessKey,
        ...(credentials.sessionToken && { sessionToken: credentials.sessionToken })
      }
    };

    this.ec2Client = new EC2Client(awsConfig);
    this.s3Client = new S3Client(awsConfig);
    this.rdsClient = new RDSClient(awsConfig);
    this.lambdaClient = new LambdaClient(awsConfig);
    this.iamClient = new IAMClient(awsConfig);
    this.elbClient = new ElasticLoadBalancingV2Client(awsConfig);
    this.eksClient = new EKSClient(awsConfig);
  }

  async scanAllResources(): Promise<AwsResource[]> {
    const resources: AwsResource[] = [];
    
    try {
      // Scan in parallel for better performance
      const [
        vpcs,
        subnets,
        instances,
        volumes,
        securityGroups,
        routeTables,
        internetGateways,
        natGateways,
        networkInterfaces,
        networkAcls,
        loadBalancers,
        s3Buckets,
        rdsInstances,
        lambdaFunctions,
        iamRoles,
        eksClusters,
        eksNodegroups,
        eksFargateProfiles
      ] = await Promise.allSettled([
        this.scanVpcs(),
        this.scanSubnets(),
        this.scanEC2Instances(),
        this.scanEBSVolumes(),
        this.scanSecurityGroups(),
        this.scanRouteTables(),
        this.scanInternetGateways(),
        this.scanNatGateways(),
        this.scanNetworkInterfaces(),
        this.scanNetworkAcls(),
        this.scanLoadBalancers(),
        this.scanS3Buckets(),
        this.scanRDSInstances(),
        this.scanLambdaFunctions(),
        this.scanIAMRoles(),
        this.scanEKSClusters(),
        this.scanEKSNodegroups(),
        this.scanEKSFargateProfiles()
      ]);

      // Collect all fulfilled results
      const results = [
        vpcs, subnets, instances, volumes, securityGroups, routeTables,
        internetGateways, natGateways, networkInterfaces, networkAcls,
        loadBalancers, s3Buckets, rdsInstances, lambdaFunctions, iamRoles,
        eksClusters, eksNodegroups, eksFargateProfiles
      ];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          resources.push(...result.value);
        } else {
          console.warn(`Failed to scan resource type ${index}:`, result.reason);
        }
      });

      return resources;
    } catch (error) {
      console.error('Error scanning AWS resources:', error);
      throw error;
    }
  }

  async scanSecurityGroupDetails(): Promise<SecurityGroupDetails[]> {
    try {
      const command = new DescribeSecurityGroupsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.SecurityGroups || []).map(sg => ({
        groupId: sg.GroupId!,
        groupName: sg.GroupName!,
        description: sg.Description || '',
        vpcId: sg.VpcId,
        inboundRules: (sg.IpPermissions || []).map(rule => this.parseSecurityGroupRule(rule, 'inbound')),
        outboundRules: (sg.IpPermissionsEgress || []).map(rule => this.parseSecurityGroupRule(rule, 'outbound'))
      }));
    } catch (error) {
      console.error('Error scanning Security Group details:', error);
      return [];
    }
  }

  async scanNetworkAclDetails(): Promise<NetworkAclDetails[]> {
    try {
      const command = new DescribeNetworkAclsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.NetworkAcls || []).map(nacl => ({
        networkAclId: nacl.NetworkAclId!,
        vpcId: nacl.VpcId!,
        isDefault: nacl.IsDefault || false,
        subnetIds: (nacl.Associations || []).map(assoc => assoc.SubnetId!).filter(Boolean),
        rules: (nacl.Entries || []).map(entry => this.parseNetworkAclRule(entry))
      }));
    } catch (error) {
      console.error('Error scanning Network ACL details:', error);
      return [];
    }
  }

  private async scanVpcs(): Promise<AwsResource[]> {
    try {
      const command = new DescribeVpcsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.Vpcs || []).map(vpc => ({
        id: vpc.VpcId!,
        name: this.getResourceName(vpc.Tags) || vpc.VpcId!,
        type: ResourceType.VPC,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:vpc/${vpc.VpcId}`,
        tags: this.parseTags(vpc.Tags),
        metadata: {
          cidrBlock: vpc.CidrBlock,
          state: vpc.State,
          isDefault: vpc.IsDefault,
          dhcpOptionsId: vpc.DhcpOptionsId,
          instanceTenancy: vpc.InstanceTenancy
        }
      }));
    } catch (error) {
      console.error('Error scanning VPCs:', error);
      return [];
    }
  }

  private async scanSubnets(): Promise<AwsResource[]> {
    try {
      const command = new DescribeSubnetsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.Subnets || []).map(subnet => ({
        id: subnet.SubnetId!,
        name: this.getResourceName(subnet.Tags) || subnet.SubnetId!,
        type: ResourceType.SUBNET,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:subnet/${subnet.SubnetId}`,
        vpcId: subnet.VpcId,
        availabilityZone: subnet.AvailabilityZone,
        tags: this.parseTags(subnet.Tags),
        metadata: {
          cidrBlock: subnet.CidrBlock,
          availableIpAddressCount: subnet.AvailableIpAddressCount,
          state: subnet.State,
          mapPublicIpOnLaunch: subnet.MapPublicIpOnLaunch
        }
      }));
    } catch (error) {
      console.error('Error scanning Subnets:', error);
      return [];
    }
  }

  private async scanEC2Instances(): Promise<AwsResource[]> {
    try {
      const command = new DescribeInstancesCommand({});
      const response = await this.ec2Client.send(command);
      
      const instances: AwsResource[] = [];
      
      (response.Reservations || []).forEach(reservation => {
        (reservation.Instances || []).forEach(instance => {
          instances.push({
            id: instance.InstanceId!,
            name: this.getResourceName(instance.Tags) || instance.InstanceId!,
            type: ResourceType.EC2_INSTANCE,
            region: this.region,
            arn: `arn:aws:ec2:${this.region}:*:instance/${instance.InstanceId}`,
            vpcId: instance.VpcId,
            subnetId: instance.SubnetId,
            availabilityZone: instance.Placement?.AvailabilityZone,
            tags: this.parseTags(instance.Tags),
            metadata: {
              instanceType: instance.InstanceType,
              state: instance.State?.Name,
              privateIpAddress: instance.PrivateIpAddress,
              publicIpAddress: instance.PublicIpAddress,
              keyName: instance.KeyName,
              securityGroupIds: instance.SecurityGroups?.map(sg => sg.GroupId),
              iamInstanceProfile: instance.IamInstanceProfile?.Arn,
              launchTime: instance.LaunchTime?.toISOString()
            }
          });
        });
      });
      
      return instances;
    } catch (error) {
      console.error('Error scanning EC2 instances:', error);
      return [];
    }
  }

  private async scanEBSVolumes(): Promise<AwsResource[]> {
    try {
      const command = new DescribeVolumesCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.Volumes || []).map(volume => ({
        id: volume.VolumeId!,
        name: this.getResourceName(volume.Tags) || volume.VolumeId!,
        type: ResourceType.EBS_VOLUME,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:volume/${volume.VolumeId}`,
        availabilityZone: volume.AvailabilityZone,
        tags: this.parseTags(volume.Tags),
        metadata: {
          size: volume.Size,
          volumeType: volume.VolumeType,
          state: volume.State,
          encrypted: volume.Encrypted,
          attachments: volume.Attachments?.map(att => ({
            instanceId: att.InstanceId,
            device: att.Device,
            state: att.State
          }))
        }
      }));
    } catch (error) {
      console.error('Error scanning EBS volumes:', error);
      return [];
    }
  }

  private async scanSecurityGroups(): Promise<AwsResource[]> {
    try {
      const command = new DescribeSecurityGroupsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.SecurityGroups || []).map(sg => ({
        id: sg.GroupId!,
        name: sg.GroupName || sg.GroupId!,
        type: ResourceType.SECURITY_GROUP,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:security-group/${sg.GroupId}`,
        vpcId: sg.VpcId,
        tags: this.parseTags(sg.Tags),
        metadata: {
          description: sg.Description,
          inboundRules: sg.IpPermissions?.length || 0,
          outboundRules: sg.IpPermissionsEgress?.length || 0,
          detailedRules: {
            inbound: (sg.IpPermissions || []).map(rule => this.parseSecurityGroupRule(rule, 'inbound')),
            outbound: (sg.IpPermissionsEgress || []).map(rule => this.parseSecurityGroupRule(rule, 'outbound'))
          }
        }
      }));
    } catch (error) {
      console.error('Error scanning Security Groups:', error);
      return [];
    }
  }

  private async scanRouteTables(): Promise<AwsResource[]> {
    try {
      const command = new DescribeRouteTablesCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.RouteTables || []).map(rt => ({
        id: rt.RouteTableId!,
        name: this.getResourceName(rt.Tags) || rt.RouteTableId!,
        type: ResourceType.ROUTE_TABLE,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:route-table/${rt.RouteTableId}`,
        vpcId: rt.VpcId,
        tags: this.parseTags(rt.Tags),
        metadata: {
          routesCount: rt.Routes?.length || 0,
          associationsCount: rt.Associations?.length || 0,
          main: rt.Associations?.some(assoc => assoc.Main) || false
        }
      }));
    } catch (error) {
      console.error('Error scanning Route Tables:', error);
      return [];
    }
  }

  private async scanInternetGateways(): Promise<AwsResource[]> {
    try {
      const command = new DescribeInternetGatewaysCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.InternetGateways || []).map(igw => ({
        id: igw.InternetGatewayId!,
        name: this.getResourceName(igw.Tags) || igw.InternetGatewayId!,
        type: ResourceType.INTERNET_GATEWAY,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:internet-gateway/${igw.InternetGatewayId}`,
        vpcId: igw.Attachments?.[0]?.VpcId,
        tags: this.parseTags(igw.Tags),
        metadata: {
          state: igw.Attachments?.[0]?.State,
          attachmentCount: igw.Attachments?.length || 0
        }
      }));
    } catch (error) {
      console.error('Error scanning Internet Gateways:', error);
      return [];
    }
  }

  private async scanNatGateways(): Promise<AwsResource[]> {
    try {
      const command = new DescribeNatGatewaysCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.NatGateways || []).map(nat => ({
        id: nat.NatGatewayId!,
        name: this.getResourceName(nat.Tags) || nat.NatGatewayId!,
        type: ResourceType.NAT_GATEWAY,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:nat-gateway/${nat.NatGatewayId}`,
        vpcId: nat.VpcId,
        subnetId: nat.SubnetId,
        tags: this.parseTags(nat.Tags),
        metadata: {
          state: nat.State,
          natGatewayAddresses: nat.NatGatewayAddresses?.length || 0
        }
      }));
    } catch (error) {
      console.error('Error scanning NAT Gateways:', error);
      return [];
    }
  }

  private async scanNetworkInterfaces(): Promise<AwsResource[]> {
    try {
      const command = new DescribeNetworkInterfacesCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.NetworkInterfaces || []).map(eni => ({
        id: eni.NetworkInterfaceId!,
        name: this.getResourceName(eni.TagSet) || eni.NetworkInterfaceId!,
        type: ResourceType.NETWORK_INTERFACE,
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:network-interface/${eni.NetworkInterfaceId}`,
        vpcId: eni.VpcId,
        subnetId: eni.SubnetId,
        availabilityZone: eni.AvailabilityZone,
        tags: this.parseTags(eni.TagSet),
        metadata: {
          status: eni.Status,
          privateIpAddress: eni.PrivateIpAddress,
          attachment: eni.Attachment ? {
            instanceId: eni.Attachment.InstanceId,
            status: eni.Attachment.Status
          } : null
        }
      }));
    } catch (error) {
      console.error('Error scanning Network Interfaces:', error);
      return [];
    }
  }

  private async scanNetworkAcls(): Promise<AwsResource[]> {
    try {
      const command = new DescribeNetworkAclsCommand({});
      const response = await this.ec2Client.send(command);
      
      return (response.NetworkAcls || []).map(nacl => ({
        id: nacl.NetworkAclId!,
        name: this.getResourceName(nacl.Tags) || nacl.NetworkAclId!,
        type: ResourceType.SECURITY_GROUP, // We'll add a NETWORK_ACL type later
        region: this.region,
        arn: `arn:aws:ec2:${this.region}:*:network-acl/${nacl.NetworkAclId}`,
        vpcId: nacl.VpcId,
        tags: this.parseTags(nacl.Tags),
        metadata: {
          isDefault: nacl.IsDefault,
          associatedSubnets: (nacl.Associations || []).map(assoc => assoc.SubnetId).filter(Boolean),
          rulesCount: nacl.Entries?.length || 0,
          detailedRules: (nacl.Entries || []).map(entry => this.parseNetworkAclRule(entry))
        }
      }));
    } catch (error) {
      console.error('Error scanning Network ACLs:', error);
      return [];
    }
  }

  private async scanLoadBalancers(): Promise<AwsResource[]> {
    try {
      const command = new DescribeLoadBalancersCommand({});
      const response = await this.elbClient.send(command);
      
      return (response.LoadBalancers || []).map(lb => ({
        id: lb.LoadBalancerArn!,
        name: lb.LoadBalancerName!,
        type: ResourceType.ELASTIC_LOAD_BALANCER,
        region: this.region,
        arn: lb.LoadBalancerArn,
        vpcId: lb.VpcId,
        tags: {},
        metadata: {
          scheme: lb.Scheme,
          state: lb.State?.Code,
          type: lb.Type,
          availabilityZones: lb.AvailabilityZones?.map(az => az.ZoneName)
        }
      }));
    } catch (error) {
      console.error('Error scanning Load Balancers:', error);
      return [];
    }
  }

  private async scanS3Buckets(): Promise<AwsResource[]> {
    try {
      const listCommand = new ListBucketsCommand({});
      const response = await this.s3Client.send(listCommand);
      
      const buckets: AwsResource[] = [];
      
      for (const bucket of response.Buckets || []) {
        try {
          // Get bucket region
          const locationCommand = new GetBucketLocationCommand({ Bucket: bucket.Name });
          const locationResponse = await this.s3Client.send(locationCommand);
          const bucketRegion = locationResponse.LocationConstraint || 'us-east-1';
          
          // Only include buckets in the current region
          if (bucketRegion === this.region || (bucketRegion === null && this.region === 'us-east-1')) {
            buckets.push({
              id: bucket.Name!,
              name: bucket.Name!,
              type: ResourceType.S3_BUCKET,
              region: bucketRegion,
              arn: `arn:aws:s3:::${bucket.Name}`,
              tags: {},
              metadata: {
                creationDate: bucket.CreationDate?.toISOString()
              }
            });
          }
        } catch (bucketError) {
          console.warn(`Could not get location for bucket ${bucket.Name}:`, bucketError);
        }
      }
      
      return buckets;
    } catch (error) {
      console.error('Error scanning S3 buckets:', error);
      return [];
    }
  }

  private async scanRDSInstances(): Promise<AwsResource[]> {
    try {
      const command = new DescribeDBInstancesCommand({});
      const response = await this.rdsClient.send(command);
      
      const instances: AwsResource[] = [];
      
      (response.DBInstances || []).forEach(db => {
        instances.push({
          id: db.DBInstanceIdentifier!,
          name: db.DBInstanceIdentifier!,
          type: ResourceType.RDS_INSTANCE,
          region: this.region,
          arn: db.DBInstanceArn,
          vpcId: db.DBSubnetGroup?.VpcId,
          availabilityZone: db.AvailabilityZone,
          tags: {},
          metadata: {
            engine: db.Engine,
            engineVersion: db.EngineVersion,
            instanceClass: db.DBInstanceClass,
            status: db.DBInstanceStatus,
            allocatedStorage: db.AllocatedStorage,
            endpoint: db.Endpoint ? {
              address: db.Endpoint.Address,
              port: db.Endpoint.Port
            } : null
          }
        });
      });
      
      return instances;
    } catch (error) {
      console.error('Error scanning RDS instances:', error);
      return [];
    }
  }

  private async scanLambdaFunctions(): Promise<AwsResource[]> {
    try {
      const command = new ListFunctionsCommand({});
      const response = await this.lambdaClient.send(command);
      
      return (response.Functions || []).map(func => ({
        id: func.FunctionArn!,
        name: func.FunctionName!,
        type: ResourceType.LAMBDA_FUNCTION,
        region: this.region,
        arn: func.FunctionArn,
        vpcId: func.VpcConfig?.VpcId,
        tags: {},
        metadata: {
          runtime: func.Runtime,
          handler: func.Handler,
          codeSize: func.CodeSize,
          timeout: func.Timeout,
          memorySize: func.MemorySize,
          lastModified: func.LastModified,
          role: func.Role
        }
      }));
    } catch (error) {
      console.error('Error scanning Lambda functions:', error);
      return [];
    }
  }

  private async scanIAMRoles(): Promise<AwsResource[]> {
    try {
      const command = new ListRolesCommand({});
      const response = await this.iamClient.send(command);
      
      return (response.Roles || []).map(role => ({
        id: role.RoleName!,
        name: role.RoleName!,
        type: ResourceType.IAM_ROLE,
        region: 'global', // IAM is global
        arn: role.Arn,
        tags: this.parseTags(role.Tags),
        metadata: {
          path: role.Path,
          createDate: role.CreateDate?.toISOString(),
          assumeRolePolicyDocument: role.AssumeRolePolicyDocument,
          maxSessionDuration: role.MaxSessionDuration
        }
      }));
    } catch (error) {
      console.error('Error scanning IAM roles:', error);
      return [];
    }
  }

  private getResourceName(tags?: Array<{Key?: string, Value?: string}>): string | null {
    if (!tags) return null;
    const nameTag = tags.find(tag => tag.Key === 'Name');
    return nameTag?.Value || null;
  }

  private async scanEKSClusters(): Promise<AwsResource[]> {
    try {
      const listCommand = new ListClustersCommand({});
      const listResponse = await this.eksClient.send(listCommand);
      
      const clusters: AwsResource[] = [];
      
      for (const clusterName of listResponse.clusters || []) {
        try {
          const describeCommand = new DescribeClusterCommand({ name: clusterName });
          const cluster = await this.eksClient.send(describeCommand);
          
          if (cluster.cluster) {
            clusters.push({
              id: cluster.cluster.name!,
              name: cluster.cluster.name!,
              type: ResourceType.EKS_CLUSTER,
              region: this.region,
              arn: cluster.cluster.arn,
              vpcId: cluster.cluster.resourcesVpcConfig?.vpcId,
              tags: this.parseTags(cluster.cluster.tags ? Object.entries(cluster.cluster.tags).map(([Key, Value]) => ({Key, Value})) : []),
              metadata: {
                version: cluster.cluster.version,
                status: cluster.cluster.status,
                endpoint: cluster.cluster.endpoint,
                platformVersion: cluster.cluster.platformVersion,
                roleArn: cluster.cluster.roleArn,
                subnets: cluster.cluster.resourcesVpcConfig?.subnetIds,
                securityGroups: cluster.cluster.resourcesVpcConfig?.securityGroupIds,
                endpointAccess: {
                  private: cluster.cluster.resourcesVpcConfig?.endpointPrivateAccess,
                  public: cluster.cluster.resourcesVpcConfig?.endpointPublicAccess
                },
                addons: cluster.cluster.health?.issues?.length || 0,
                createdAt: cluster.cluster.createdAt?.toISOString()
              }
            });
          }
        } catch (clusterError) {
          console.warn(`Could not describe EKS cluster ${clusterName}:`, clusterError);
        }
      }
      
      return clusters;
    } catch (error) {
      console.error('Error scanning EKS clusters:', error);
      return [];
    }
  }

  private async scanEKSNodegroups(): Promise<AwsResource[]> {
    try {
      // First get all clusters
      const listCommand = new ListClustersCommand({});
      const listResponse = await this.eksClient.send(listCommand);
      
      const nodegroups: AwsResource[] = [];
      
      for (const clusterName of listResponse.clusters || []) {
        try {
          const listNodegroupsCommand = new ListNodegroupsCommand({ clusterName });
          const nodegroupsResponse = await this.eksClient.send(listNodegroupsCommand);
          
          for (const nodegroupName of nodegroupsResponse.nodegroups || []) {
            try {
              const describeCommand = new DescribeNodegroupCommand({ 
                clusterName, 
                nodegroupName 
              });
              const nodegroup = await this.eksClient.send(describeCommand);
              
              if (nodegroup.nodegroup) {
                nodegroups.push({
                  id: `${clusterName}/${nodegroup.nodegroup.nodegroupName}`,
                  name: nodegroup.nodegroup.nodegroupName!,
                  type: ResourceType.EKS_NODEGROUP,
                  region: this.region,
                  arn: nodegroup.nodegroup.nodegroupArn,
                  tags: this.parseTags(nodegroup.nodegroup.tags ? Object.entries(nodegroup.nodegroup.tags).map(([Key, Value]) => ({Key, Value})) : []),
                  metadata: {
                    clusterName,
                    status: nodegroup.nodegroup.status,
                    instanceTypes: nodegroup.nodegroup.instanceTypes,
                    amiType: nodegroup.nodegroup.amiType,
                    capacityType: nodegroup.nodegroup.capacityType,
                    scalingConfig: nodegroup.nodegroup.scalingConfig,
                    diskSize: nodegroup.nodegroup.diskSize,
                    nodeRole: nodegroup.nodegroup.nodeRole,
                    subnets: nodegroup.nodegroup.subnets,
                    launchTemplate: nodegroup.nodegroup.launchTemplate,
                    version: nodegroup.nodegroup.version,
                    createdAt: nodegroup.nodegroup.createdAt?.toISOString(),
                    modifiedAt: nodegroup.nodegroup.modifiedAt?.toISOString()
                  }
                });
              }
            } catch (nodegroupError) {
              console.warn(`Could not describe nodegroup ${nodegroupName}:`, nodegroupError);
            }
          }
        } catch (clusterError) {
          console.warn(`Could not list nodegroups for cluster ${clusterName}:`, clusterError);
        }
      }
      
      return nodegroups;
    } catch (error) {
      console.error('Error scanning EKS nodegroups:', error);
      return [];
    }
  }

  private async scanEKSFargateProfiles(): Promise<AwsResource[]> {
    try {
      // First get all clusters
      const listCommand = new ListClustersCommand({});
      const listResponse = await this.eksClient.send(listCommand);
      
      const fargateProfiles: AwsResource[] = [];
      
      for (const clusterName of listResponse.clusters || []) {
        try {
          const listFargateCommand = new ListFargateProfilesCommand({ clusterName });
          const fargateResponse = await this.eksClient.send(listFargateCommand);
          
          for (const fargateProfileName of fargateResponse.fargateProfileNames || []) {
            try {
              const describeCommand = new DescribeFargateProfileCommand({ 
                clusterName, 
                fargateProfileName 
              });
              const fargateProfile = await this.eksClient.send(describeCommand);
              
              if (fargateProfile.fargateProfile) {
                fargateProfiles.push({
                  id: `${clusterName}/${fargateProfile.fargateProfile.fargateProfileName}`,
                  name: fargateProfile.fargateProfile.fargateProfileName!,
                  type: ResourceType.EKS_FARGATE_PROFILE,
                  region: this.region,
                  arn: fargateProfile.fargateProfile.fargateProfileArn,
                  tags: this.parseTags(fargateProfile.fargateProfile.tags ? Object.entries(fargateProfile.fargateProfile.tags).map(([Key, Value]) => ({Key, Value})) : []),
                  metadata: {
                    clusterName,
                    status: fargateProfile.fargateProfile.status,
                    podExecutionRoleArn: fargateProfile.fargateProfile.podExecutionRoleArn,
                    subnets: fargateProfile.fargateProfile.subnets,
                    selectors: fargateProfile.fargateProfile.selectors,
                    platformVersion: fargateProfile.fargateProfile.platformVersion,
                    createdAt: fargateProfile.fargateProfile.createdAt?.toISOString()
                  }
                });
              }
            } catch (fargateError) {
              console.warn(`Could not describe Fargate profile ${fargateProfileName}:`, fargateError);
            }
          }
        } catch (clusterError) {
          console.warn(`Could not list Fargate profiles for cluster ${clusterName}:`, clusterError);
        }
      }
      
      return fargateProfiles;
    } catch (error) {
      console.error('Error scanning EKS Fargate profiles:', error);
      return [];
    }
  }

  private parseTags(tags?: Array<{Key?: string, Value?: string}>): Record<string, string> {
    if (!tags) return {};
    const result: Record<string, string> = {};
    tags.forEach(tag => {
      if (tag.Key && tag.Value) {
        result[tag.Key] = tag.Value;
      }
    });
    return result;
  }

  private getResourceName(tags?: Array<{Key?: string, Value?: string}>): string | null {
    if (!tags) return null;
    const nameTag = tags.find(tag => tag.Key === 'Name');
    return nameTag?.Value || null;
  }

  private parseSecurityGroupRule(rule: any, direction: 'inbound' | 'outbound'): SecurityGroupRule {
    const protocol = rule.IpProtocol === '-1' ? 'all' : rule.IpProtocol;
    
    // Extract CIDR blocks
    const cidrBlocks = (rule.IpRanges || []).map((range: any) => range.CidrIp).filter(Boolean);
    
    // Extract source security group
    const sourceSecurityGroupId = rule.UserIdGroupPairs?.[0]?.GroupId;
    
    // Extract port range
    const fromPort = rule.FromPort;
    const toPort = rule.ToPort;
    
    return {
      protocol,
      fromPort,
      toPort,
      cidrBlocks: cidrBlocks.length > 0 ? cidrBlocks : undefined,
      sourceSecurityGroupId,
      description: rule.Description || `${direction} rule for ${protocol}`,
      direction
    };
  }

  private parseNetworkAclRule(entry: any): NetworkAclRule {
    const protocol = entry.Protocol === '-1' ? 'all' : entry.Protocol;
    
    return {
      ruleNumber: entry.RuleNumber || 0,
      protocol,
      ruleAction: entry.RuleAction === 'allow' ? 'allow' : 'deny',
      portRange: entry.PortRange ? {
        from: entry.PortRange.From,
        to: entry.PortRange.To
      } : undefined,
      cidrBlock: entry.CidrBlock || '0.0.0.0/0',
      direction: entry.Egress ? 'outbound' : 'inbound'
    };
  }
} 