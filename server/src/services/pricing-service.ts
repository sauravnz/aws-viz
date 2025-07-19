import { PricingClient, GetProductsCommand, GetAttributeValuesCommand } from '@aws-sdk/client-pricing';
import { ResourceType } from '../../../shared/types';

interface PricingData {
  pricePerHour?: number;
  pricePerMonth?: number;
  pricePerGB?: number;
  currency: string;
  unit: string;
}

interface ResourcePricingMap {
  [key: string]: PricingData;
}

export class AwsPricingService {
  private pricingClient: PricingClient;
  private pricingCache: ResourcePricingMap = {};
  private cacheExpiry: Date = new Date();

  constructor(region: string = 'us-east-1') {
    // AWS Pricing API is only available in specific regions
    const pricingRegion = ['us-east-1', 'eu-central-1', 'ap-south-1'].includes(region) 
      ? region 
      : 'us-east-1';
      
    this.pricingClient = new PricingClient({ region: pricingRegion });
  }

  async getResourcePricing(resourceType: ResourceType, region: string, instanceType?: string): Promise<PricingData | null> {
    const cacheKey = `${resourceType}-${region}-${instanceType || 'default'}`;
    
    // Check cache (valid for 24 hours)
    if (this.pricingCache[cacheKey] && this.cacheExpiry > new Date()) {
      return this.pricingCache[cacheKey];
    }

    try {
      let pricing: PricingData | null = null;

      switch (resourceType) {
        case ResourceType.EC2_INSTANCE:
          pricing = await this.getEC2Pricing(region, instanceType || 't3.medium');
          break;
        case ResourceType.EKS_CLUSTER:
          pricing = await this.getEKSPricing(region);
          break;
        case ResourceType.RDS_INSTANCE:
          pricing = await this.getRDSPricing(region, instanceType || 'db.t3.micro');
          break;
        case ResourceType.ELASTIC_LOAD_BALANCER:
          pricing = await this.getLoadBalancerPricing(region);
          break;
        case ResourceType.NAT_GATEWAY:
          pricing = await this.getNATGatewayPricing(region);
          break;
        case ResourceType.S3_BUCKET:
          pricing = await this.getS3Pricing(region);
          break;
        case ResourceType.EBS_VOLUME:
          pricing = await this.getEBSPricing(region);
          break;
        default:
          return null;
      }

      if (pricing) {
        this.pricingCache[cacheKey] = pricing;
        // Cache for 24 hours
        this.cacheExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
      }

      return pricing;
    } catch (error) {
      console.error(`Error fetching pricing for ${resourceType}:`, error);
      return null;
    }
  }

  private async getEC2Pricing(region: string, instanceType: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonEC2',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'instanceType',
            Value: instanceType
          },
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'tenancy',
            Value: 'Shared'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'operatingSystem',
            Value: 'Linux'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'preInstalledSw',
            Value: 'NA'
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching EC2 pricing:', error);
      return null;
    }
  }

  private async getEKSPricing(region: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonEKS',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching EKS pricing:', error);
      return { pricePerHour: 0.10, pricePerMonth: 73.0, currency: 'USD', unit: 'Hrs' };
    }
  }

  private async getRDSPricing(region: string, instanceClass: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonRDS',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'instanceType',
            Value: instanceClass
          },
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'databaseEngine',
            Value: 'PostgreSQL'
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching RDS pricing:', error);
      return null;
    }
  }

  private async getLoadBalancerPricing(region: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AWSELB',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'usagetype',
            Value: `${region.toUpperCase().replace(/-/g, '')}-LoadBalancerUsage`
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching Load Balancer pricing:', error);
      return { pricePerHour: 0.0225, pricePerMonth: 16.425, currency: 'USD', unit: 'Hrs' };
    }
  }

  private async getNATGatewayPricing(region: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonVPC',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'usagetype',
            Value: `${region.toUpperCase().replace(/-/g, '')}-NatGateway-Hours`
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching NAT Gateway pricing:', error);
      return { pricePerHour: 0.045, pricePerMonth: 32.85, currency: 'USD', unit: 'Hrs' };
    }
  }

  private async getS3Pricing(region: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonS3',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'storageClass',
            Value: 'General Purpose'
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching S3 pricing:', error);
      return { pricePerGB: 0.023, pricePerMonth: 5.0, currency: 'USD', unit: 'GB-Mo' };
    }
  }

  private async getEBSPricing(region: string): Promise<PricingData | null> {
    try {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonEC2',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'location',
            Value: this.mapRegionToLocation(region)
          },
          {
            Type: 'TERM_MATCH',
            Field: 'productFamily',
            Value: 'Storage'
          },
          {
            Type: 'TERM_MATCH',
            Field: 'volumeType',
            Value: 'General Purpose'
          }
        ],
        MaxResults: 1
      });

      const response = await this.pricingClient.send(command);
      return this.extractPricing(response.PriceList);
    } catch (error) {
      console.error('Error fetching EBS pricing:', error);
      return { pricePerGB: 0.10, pricePerMonth: 8.0, currency: 'USD', unit: 'GB-Mo' };
    }
  }

  private extractPricing(priceList: string[] | undefined): PricingData | null {
    if (!priceList || priceList.length === 0) {
      return null;
    }

    try {
      const product = JSON.parse(priceList[0]);
      const terms = product.terms?.OnDemand || {};
      
      for (const termKey of Object.keys(terms)) {
        const priceDimensions = terms[termKey].priceDimensions || {};
        
        for (const dimensionKey of Object.keys(priceDimensions)) {
          const dimension = priceDimensions[dimensionKey];
          const pricePerUnit = parseFloat(dimension.pricePerUnit?.USD || '0');
          
          if (pricePerUnit > 0) {
            const unit = dimension.unit || 'Hrs';
            let pricePerHour = pricePerUnit;
            let pricePerMonth = pricePerUnit * 24 * 30; // Rough monthly estimate

            if (unit.includes('GB')) {
              return {
                pricePerGB: pricePerUnit,
                pricePerMonth: pricePerUnit * 50, // Estimate 50GB usage
                currency: 'USD',
                unit
              };
            }

            return {
              pricePerHour,
              pricePerMonth,
              currency: 'USD',
              unit
            };
          }
        }
      }
    } catch (error) {
      console.error('Error parsing price list:', error);
    }

    return null;
  }

  private mapRegionToLocation(region: string): string {
    const regionMap: Record<string, string> = {
      'us-east-1': 'US East (N. Virginia)',
      'us-east-2': 'US East (Ohio)',
      'us-west-1': 'US West (N. California)',
      'us-west-2': 'US West (Oregon)',
      'eu-west-1': 'Europe (Ireland)',
      'eu-central-1': 'Europe (Frankfurt)',
      'ap-south-1': 'Asia Pacific (Mumbai)',
      'ap-southeast-1': 'Asia Pacific (Singapore)',
      'ap-southeast-2': 'Asia Pacific (Sydney)',
      'ap-northeast-1': 'Asia Pacific (Tokyo)',
      'ca-central-1': 'Canada (Central)',
      'sa-east-1': 'South America (Sao Paulo)'
    };

    return regionMap[region] || region;
  }

  // Method to get bulk pricing for multiple resources
  async getBulkResourcePricing(resources: Array<{type: ResourceType, region: string, instanceType?: string}>): Promise<ResourcePricingMap> {
    const results: ResourcePricingMap = {};
    
    const promises = resources.map(async (resource) => {
      const key = `${resource.type}-${resource.region}-${resource.instanceType || 'default'}`;
      const pricing = await this.getResourcePricing(resource.type, resource.region, resource.instanceType);
      if (pricing) {
        results[key] = pricing;
      }
    });

    await Promise.all(promises);
    return results;
  }
} 