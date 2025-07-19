import React, { useMemo } from 'react';
import { BusinessFlowGraphData, ResourceType } from '../../../shared/types';

interface CostCalculatorProps {
  data: BusinessFlowGraphData;
}

interface CostBreakdown {
  compute: number;
  containers: number;
  networking: number;
  storage: number;
  database: number;
  appServices: number;
  total: number;
  breakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
    color: string;
  }>;
}

// AWS pricing estimates (simplified for demo)
const AWS_PRICING: Record<ResourceType, number> = {
  [ResourceType.EC2_INSTANCE]: 50.0, // per instance per month
  [ResourceType.EKS_CLUSTER]: 73.0, // EKS control plane
  [ResourceType.EKS_NODEGROUP]: 25.0, // additional per node group
  [ResourceType.EKS_FARGATE_PROFILE]: 15.0, // per profile
  [ResourceType.ELASTIC_LOAD_BALANCER]: 25.0, // ALB/NLB per month
  [ResourceType.NAT_GATEWAY]: 45.0, // per NAT gateway
  [ResourceType.INTERNET_GATEWAY]: 0.0, // free
  [ResourceType.VPC]: 0.0, // free
  [ResourceType.SUBNET]: 0.0, // free
  [ResourceType.SECURITY_GROUP]: 0.0, // free
  [ResourceType.S3_BUCKET]: 5.0, // estimated per bucket
  [ResourceType.RDS_INSTANCE]: 45.0, // db.t3.micro
  [ResourceType.EBS_VOLUME]: 10.0, // per volume
  [ResourceType.LAMBDA_FUNCTION]: 8.0, // estimated usage
  [ResourceType.ROUTE_TABLE]: 0.0, // free
  [ResourceType.NETWORK_INTERFACE]: 0.0, // free
  [ResourceType.IAM_ROLE]: 0.0, // free
};

const CATEGORY_COLORS = {
  compute: '#3B82F6', // blue
  containers: '#10B981', // green
  networking: '#F59E0B', // amber
  storage: '#8B5CF6', // purple
  database: '#EF4444', // red
  appServices: '#6B7280', // gray
};

export const CostCalculator: React.FC<CostCalculatorProps> = ({ data }) => {
  const costBreakdown = useMemo((): CostBreakdown => {
    const costs = {
      compute: 0,
      containers: 0,
      networking: 0,
      storage: 0,
      database: 0,
      appServices: 0,
    };

    data.nodes.forEach(node => {
      // Use real pricing data if available, otherwise fall back to estimates
      let monthlyCost = 0;
      
      if (data.pricingData && data.pricingData[node.id]) {
        const pricing = data.pricingData[node.id];
        monthlyCost = pricing.pricePerMonth || (pricing.pricePerHour ? pricing.pricePerHour * 24 * 30 : 0);
        console.log(`💰 Using real pricing for ${node.name} (${node.type}): $${monthlyCost.toFixed(2)}/month`);
      } else {
        monthlyCost = AWS_PRICING[node.type] || 0;
        console.log(`📊 Using estimate for ${node.name} (${node.type}): $${monthlyCost.toFixed(2)}/month`);
      }
      
      switch (node.type) {
        case ResourceType.EC2_INSTANCE:
          costs.compute += monthlyCost;
          break;
        case ResourceType.EKS_CLUSTER:
        case ResourceType.EKS_NODEGROUP:
        case ResourceType.EKS_FARGATE_PROFILE:
          costs.containers += monthlyCost;
          break;
        case ResourceType.ELASTIC_LOAD_BALANCER:
        case ResourceType.NAT_GATEWAY:
        case ResourceType.INTERNET_GATEWAY:
          costs.networking += monthlyCost;
          break;
        case ResourceType.S3_BUCKET:
        case ResourceType.EBS_VOLUME:
          costs.storage += monthlyCost;
          break;
        case ResourceType.RDS_INSTANCE:
          costs.database += monthlyCost;
          break;
        case ResourceType.LAMBDA_FUNCTION:
          costs.appServices += monthlyCost;
          break;
      }
    });

    const total = Object.values(costs).reduce((sum, cost) => sum + cost, 0);

    const breakdown = [
      { category: 'Compute', amount: costs.compute, percentage: (costs.compute / total) * 100, color: CATEGORY_COLORS.compute },
      { category: 'Containers', amount: costs.containers, percentage: (costs.containers / total) * 100, color: CATEGORY_COLORS.containers },
      { category: 'Networking', amount: costs.networking, percentage: (costs.networking / total) * 100, color: CATEGORY_COLORS.networking },
      { category: 'Storage', amount: costs.storage, percentage: (costs.storage / total) * 100, color: CATEGORY_COLORS.storage },
      { category: 'Database', amount: costs.database, percentage: (costs.database / total) * 100, color: CATEGORY_COLORS.database },
      { category: 'App Services', amount: costs.appServices, percentage: (costs.appServices / total) * 100, color: CATEGORY_COLORS.appServices },
    ].filter(item => item.amount > 0);

    return {
      ...costs,
      total,
      breakdown,
    };
  }, [data.nodes]);

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const generatePieChart = () => {
    const size = 200;
    const radius = size / 2 - 20;
    const centerX = size / 2;
    const centerY = size / 2;
    
    let currentAngle = 0;
    
    return (
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {costBreakdown.breakdown.map((item, index) => {
          const sliceAngle = (item.percentage / 100) * 2 * Math.PI;
          const startAngle = currentAngle;
          const endAngle = currentAngle + sliceAngle;
          
          const x1 = centerX + radius * Math.cos(startAngle);
          const y1 = centerY + radius * Math.sin(startAngle);
          const x2 = centerX + radius * Math.cos(endAngle);
          const y2 = centerY + radius * Math.sin(endAngle);
          
          const largeArc = sliceAngle > Math.PI ? 1 : 0;
          
          const pathData = [
            `M ${centerX} ${centerY}`,
            `L ${x1} ${y1}`,
            `A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2}`,
            'Z'
          ].join(' ');
          
          currentAngle += sliceAngle;
          
          return (
            <path
              key={index}
              d={pathData}
              fill={item.color}
              stroke="white"
              strokeWidth="2"
            />
          );
        })}
        
        {/* Labels */}
        {costBreakdown.breakdown.map((item, index) => {
          let labelAngle = 0;
          for (let i = 0; i <= index; i++) {
            const prevPercentage = i === 0 ? 0 : costBreakdown.breakdown[i - 1].percentage;
            labelAngle += i === index ? item.percentage / 2 : (i === 0 ? prevPercentage : costBreakdown.breakdown[i].percentage);
          }
          labelAngle = labelAngle / 100 * 2 * Math.PI;
          
          const labelRadius = radius + 25;
          const labelX = centerX + labelRadius * Math.cos(labelAngle);
          const labelY = centerY + labelRadius * Math.sin(labelAngle);
          
          if (item.percentage > 5) {
            return (
              <text
                key={`label-${index}`}
                x={labelX}
                y={labelY}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="11"
                fontWeight="500"
                fill="#374151"
              >
                {item.category} {item.percentage.toFixed(1)}%
              </text>
            );
          }
          return null;
        })}
      </svg>
    );
  };

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      width: '380px',
      background: '#1F2937',
      borderRadius: '12px',
      padding: '20px',
      boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      zIndex: 1000,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
          {data.pricingData ? '💰 Real AWS Costs' : '📊 Cost Estimates'} for {data.metadata.region}
        </h3>
        <button style={{
          background: '#10B981',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
          padding: '6px 12px',
          fontSize: '12px',
          fontWeight: '500',
          cursor: 'pointer',
        }}>
          📥 EXPORT
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* Cost Breakdown */}
        <div style={{ flex: 1 }}>
          {costBreakdown.breakdown.map((item, index) => (
            <div key={index} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '12px',
              padding: '8px 0',
              borderBottom: index < costBreakdown.breakdown.length - 1 ? '1px solid #374151' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '2px',
                  backgroundColor: item.color,
                }}></div>
                <span style={{ fontSize: '14px' }}>{item.category}</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ color: '#10B981', fontSize: '16px', fontWeight: '600' }}>
                  {formatCurrency(item.amount)}
                </div>
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>/ mo</div>
              </div>
            </div>
          ))}
          
          <div style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '2px solid #374151',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span style={{ fontSize: '16px', fontWeight: '600' }}>Total</span>
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#10B981', fontSize: '20px', fontWeight: '700' }}>
                {formatCurrency(costBreakdown.total)}
              </div>
              <div style={{ fontSize: '14px', color: '#9CA3AF' }}>/ mo</div>
            </div>
          </div>
        </div>

        {/* Pie Chart */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {generatePieChart()}
        </div>
      </div>

      <div style={{
        marginTop: '16px',
        fontSize: '11px',
        color: '#9CA3AF',
        textAlign: 'center',
      }}>
        {data.pricingData ? (
          <div>
            💰 Real AWS pricing data for {data.metadata.region}<br/>
            {Object.keys(data.pricingData).length} resources with live pricing
          </div>
        ) : (
          <div>
            📊 Estimates based on {data.metadata.totalResources} resources<br/>
            *Not using real AWS pricing data
          </div>
        )}
      </div>
    </div>
  );
}; 