import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { GraphData, GraphNode, GraphLink, ResourceType, InfrastructureLayer, FilterOptions } from '../../../shared/types';

interface NetworkVisualizationProps {
  data: GraphData;
  onRefresh: () => void;
}

interface D3Node extends GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
}

interface D3Link extends GraphLink {
  source: D3Node | string;
  target: D3Node | string;
}

// Color scheme for different resource types
const getResourceColor = (type: ResourceType): string => {
  const colors: Record<ResourceType, string> = {
    [ResourceType.EC2_INSTANCE]: '#FF6B6B',
    [ResourceType.LAMBDA_FUNCTION]: '#4ECDC4',
    [ResourceType.EKS_CLUSTER]: '#326CE5',
    [ResourceType.EKS_NODEGROUP]: '#4285F4',
    [ResourceType.EKS_FARGATE_PROFILE]: '#5C85F7',
    [ResourceType.S3_BUCKET]: '#45B7D1',
    [ResourceType.EBS_VOLUME]: '#96CEB4',
    [ResourceType.RDS_INSTANCE]: '#FFEAA7',
    [ResourceType.VPC]: '#DDA0DD',
    [ResourceType.SUBNET]: '#98D8C8',
    [ResourceType.ROUTE_TABLE]: '#F7DC6F',
    [ResourceType.INTERNET_GATEWAY]: '#BB8FCE',
    [ResourceType.NAT_GATEWAY]: '#85C1E9',
    [ResourceType.SECURITY_GROUP]: '#F8C471',
    [ResourceType.NETWORK_INTERFACE]: '#82E0AA',
    [ResourceType.ELASTIC_LOAD_BALANCER]: '#F1948A',
    [ResourceType.IAM_ROLE]: '#D7BDE2'
  };
  return colors[type] || '#BDC3C7';
};

// Icon/symbol for different resource types
const getResourceSymbol = (type: ResourceType): string => {
  const symbols: Record<ResourceType, string> = {
    [ResourceType.EC2_INSTANCE]: '🖥️',
    [ResourceType.LAMBDA_FUNCTION]: '⚡',
    [ResourceType.EKS_CLUSTER]: '☸️',
    [ResourceType.EKS_NODEGROUP]: '⚙️',
    [ResourceType.EKS_FARGATE_PROFILE]: '🐳',
    [ResourceType.S3_BUCKET]: '🪣',
    [ResourceType.EBS_VOLUME]: '💾',
    [ResourceType.RDS_INSTANCE]: '🗄️',
    [ResourceType.VPC]: '🏢',
    [ResourceType.SUBNET]: '🏠',
    [ResourceType.ROUTE_TABLE]: '🗺️',
    [ResourceType.INTERNET_GATEWAY]: '🌐',
    [ResourceType.NAT_GATEWAY]: '🔄',
    [ResourceType.SECURITY_GROUP]: '🛡️',
    [ResourceType.NETWORK_INTERFACE]: '🔌',
    [ResourceType.ELASTIC_LOAD_BALANCER]: '⚖️',
    [ResourceType.IAM_ROLE]: '👤'
  };
  return symbols[type] || '📦';
};

export const NetworkVisualization: React.FC<NetworkVisualizationProps> = ({ data, onRefresh }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<D3Node | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string; visible: boolean }>({
    x: 0,
    y: 0,
    content: '',
    visible: false
  });
  const [filters, setFilters] = useState<FilterOptions>({
    layers: [InfrastructureLayer.GATEWAY, InfrastructureLayer.LOAD_BALANCER, InfrastructureLayer.COMPUTE, InfrastructureLayer.DATA, InfrastructureLayer.FOUNDATION],
    serviceTypes: Object.values(ResourceType),
    showRelationships: true,
    groupByVpc: true
  });

  useEffect(() => {
    if (!svgRef.current || !data.nodes.length) return;

    // Clear previous visualization
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current);
    const container = svg.node()?.parentElement;
    if (!container) return;

    const width = container.clientWidth;
    const height = container.clientHeight;

    svg.attr("width", width).attr("height", height);

    // Create zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
      });

    svg.call(zoom);

    // Main group for all elements
    const g = svg.append("g");

    // Filter data based on current filters
    const filteredNodes = data.nodes.filter(node => 
      filters.layers.includes(node.layer) && 
      filters.serviceTypes.includes(node.type)
    );
    const filteredLinks = filters.showRelationships ? 
      data.links.filter(link => 
        filteredNodes.some(n => n.id === link.source) && 
        filteredNodes.some(n => n.id === link.target)
      ) : [];

    // Create hierarchical layout
    const layerHeight = height / 6; // 5 layers + padding
    const layerGroups: Map<number, D3Node[]> = new Map();
    
    // Group nodes by layer
    filteredNodes.forEach(node => {
      const layer = node.layer;
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(node as D3Node);
    });

    // Position nodes in hierarchical layers
    const nodePositions = new Map<string, {x: number, y: number}>();
    layerGroups.forEach((nodes, layer) => {
      const y = layerHeight * (layer - 0.5); // Convert layer to y position
      const nodeSpacing = Math.min(width / (nodes.length + 1), 120);
      const startX = (width - (nodes.length - 1) * nodeSpacing) / 2;
      
      nodes.forEach((node, index) => {
        const x = startX + index * nodeSpacing;
        node.x = x;
        node.y = y;
        nodePositions.set(node.id, {x, y});
      });
    });

    // Create links
    const link = g.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(filteredLinks)
      .enter().append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d) => Math.sqrt(d.value))
      .attr("marker-end", "url(#arrowhead)")
      .attr("x1", (d: any) => nodePositions.get(typeof d.source === 'string' ? d.source : d.source.id)?.x || 0)
      .attr("y1", (d: any) => nodePositions.get(typeof d.source === 'string' ? d.source : d.source.id)?.y || 0)
      .attr("x2", (d: any) => nodePositions.get(typeof d.target === 'string' ? d.target : d.target.id)?.x || 0)
      .attr("y2", (d: any) => nodePositions.get(typeof d.target === 'string' ? d.target : d.target.id)?.y || 0);

    // Create arrow markers
    g.append("defs").append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 15)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#999");

    // Create node groups
    const nodeGroup = g.append("g")
      .attr("class", "nodes")
      .selectAll("g")
      .data(filteredNodes)
      .enter().append("g")
      .attr("class", "node")
      .attr("transform", (d) => `translate(${d.x},${d.y})`);

    // Add circles for nodes
    nodeGroup.append("circle")
      .attr("r", 20)
      .attr("fill", (d) => getResourceColor(d.type))
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .on("mouseover", (event, d) => {
        // Show tooltip
        setTooltip({
          x: event.pageX + 10,
          y: event.pageY - 10,
          content: formatTooltipContent(d),
          visible: true
        });
      })
      .on("mouseout", () => {
        setTooltip(prev => ({ ...prev, visible: false }));
      })
      .on("click", (event, d) => {
        setSelectedNode(d);
        event.stopPropagation();
      });

    // Add text labels for resource symbols
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.3em")
      .style("font-size", "16px")
      .style("pointer-events", "none")
      .text((d) => getResourceSymbol(d.type));

    // Add resource names
    nodeGroup.append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "35px")
      .style("font-size", "10px")
      .style("font-weight", "bold")
      .style("fill", "#333")
      .style("pointer-events", "none")
      .text((d) => d.name.length > 15 ? d.name.substring(0, 15) + "..." : d.name);

    // Add layer labels
    const layerLabels = ['Gateways', 'Load Balancers', 'Compute', 'Data', 'Foundation'];
    g.append("g")
      .attr("class", "layer-labels")
      .selectAll("text")
      .data(layerLabels)
      .enter().append("text")
      .attr("x", 10)
      .attr("y", (d, i) => layerHeight * (i + 0.5))
      .attr("text-anchor", "start")
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .style("fill", "#333")
      .style("opacity", 0.7)
      .text(d => d);

    // Add legend
    const legend = svg.append("g")
      .attr("class", "legend")
      .attr("transform", `translate(20, 20)`);

    const resourceTypes = Array.from(new Set(filteredNodes.map(n => n.type)));
    
    const legendItem = legend.selectAll(".legend-item")
      .data(resourceTypes)
      .enter().append("g")
      .attr("class", "legend-item")
      .attr("transform", (d, i) => `translate(0, ${i * 25})`);

    legendItem.append("circle")
      .attr("r", 8)
      .attr("fill", getResourceColor)
      .attr("stroke", "#fff")
      .attr("stroke-width", 1);

    legendItem.append("text")
      .attr("x", 5)
      .attr("y", 3)
      .style("font-size", "10px")
      .text(getResourceSymbol);

    legendItem.append("text")
      .attr("x", 20)
      .attr("y", 4)
      .style("font-size", "12px")
      .style("fill", "#333")
      .text((d) => d.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));

    // Add controls
    const controls = svg.append("g")
      .attr("class", "controls")
      .attr("transform", `translate(${width - 120}, 20)`);

    // Reset zoom button
    const resetButton = controls.append("g")
      .attr("class", "reset-button")
      .style("cursor", "pointer")
      .on("click", () => {
        svg.transition().duration(750).call(
          zoom.transform,
          d3.zoomIdentity.translate(0, 0).scale(1)
        );
      });

    resetButton.append("rect")
      .attr("width", 100)
      .attr("height", 30)
      .attr("rx", 5)
      .attr("fill", "#667eea")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1);

    resetButton.append("text")
      .attr("x", 50)
      .attr("y", 20)
      .attr("text-anchor", "middle")
      .style("fill", "white")
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text("Reset View");

    // Click to deselect
    svg.on("click", () => {
      setSelectedNode(null);
    });

  }, [data, filters]);

  const formatTooltipContent = (node: D3Node): string => {
    const metadata = node.metadata;
    let content = `<div class="tooltip-title">${getResourceSymbol(node.type)} ${node.name}</div>`;
    content += `<div class="tooltip-info">Type: ${node.type}</div>`;
    
    if (metadata.region) {
      content += `<div class="tooltip-info">Region: ${metadata.region}</div>`;
    }
    
    if (metadata.vpcId) {
      content += `<div class="tooltip-info">VPC: ${metadata.vpcId}</div>`;
    }
    
    if (metadata.subnetId) {
      content += `<div class="tooltip-info">Subnet: ${metadata.subnetId}</div>`;
    }

    if (metadata.availabilityZone) {
      content += `<div class="tooltip-info">AZ: ${metadata.availabilityZone}</div>`;
    }

    // Add specific metadata based on resource type
    if (node.type === ResourceType.EC2_INSTANCE) {
      if (metadata.instanceType) content += `<div class="tooltip-info">Instance Type: ${metadata.instanceType}</div>`;
      if (metadata.state) content += `<div class="tooltip-info">State: ${metadata.state}</div>`;
      if (metadata.privateIpAddress) content += `<div class="tooltip-info">Private IP: ${metadata.privateIpAddress}</div>`;
    } else if (node.type === ResourceType.S3_BUCKET) {
      if (metadata.creationDate) content += `<div class="tooltip-info">Created: ${new Date(metadata.creationDate).toLocaleDateString()}</div>`;
    } else if (node.type === ResourceType.RDS_INSTANCE) {
      if (metadata.engine) content += `<div class="tooltip-info">Engine: ${metadata.engine}</div>`;
      if (metadata.instanceClass) content += `<div class="tooltip-info">Instance Class: ${metadata.instanceClass}</div>`;
      if (metadata.status) content += `<div class="tooltip-info">Status: ${metadata.status}</div>`;
    } else if (node.type === ResourceType.EKS_CLUSTER) {
      if (metadata.version) content += `<div class="tooltip-info">Kubernetes Version: ${metadata.version}</div>`;
      if (metadata.status) content += `<div class="tooltip-info">Status: ${metadata.status}</div>`;
      if (metadata.endpoint) content += `<div class="tooltip-info">Endpoint: ${metadata.endpoint}</div>`;
    } else if (node.type === ResourceType.EKS_NODEGROUP) {
      if (metadata.clusterName) content += `<div class="tooltip-info">Cluster: ${metadata.clusterName}</div>`;
      if (metadata.instanceTypes) content += `<div class="tooltip-info">Instance Types: ${metadata.instanceTypes.join(', ')}</div>`;
      if (metadata.status) content += `<div class="tooltip-info">Status: ${metadata.status}</div>`;
    } else if (node.type === ResourceType.EKS_FARGATE_PROFILE) {
      if (metadata.clusterName) content += `<div class="tooltip-info">Cluster: ${metadata.clusterName}</div>`;
      if (metadata.status) content += `<div class="tooltip-info">Status: ${metadata.status}</div>`;
      if (metadata.platformVersion) content += `<div class="tooltip-info">Platform: ${metadata.platformVersion}</div>`;
    }

    return content;
  };

  const toggleLayer = (layer: InfrastructureLayer) => {
    setFilters(prev => ({
      ...prev,
      layers: prev.layers.includes(layer) 
        ? prev.layers.filter(l => l !== layer)
        : [...prev.layers, layer]
    }));
  };

  const toggleServiceType = (serviceType: ResourceType) => {
    setFilters(prev => ({
      ...prev,
      serviceTypes: prev.serviceTypes.includes(serviceType)
        ? prev.serviceTypes.filter(t => t !== serviceType)
        : [...prev.serviceTypes, serviceType]
    }));
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', background: '#fafafa' }}
      />
      
      {tooltip.visible && (
        <div
          className="node-tooltip"
          style={{
            left: tooltip.x,
            top: tooltip.y,
          }}
          dangerouslySetInnerHTML={{ __html: tooltip.content }}
        />
      )}

      {/* Filter Controls */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        background: 'white',
        padding: '15px',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        maxWidth: '250px',
        border: '1px solid #e1e5e9',
        fontSize: '0.85rem'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>🎛️ Filters</h4>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Layers:</strong>
          {[
            { layer: InfrastructureLayer.GATEWAY, name: 'Gateways' },
            { layer: InfrastructureLayer.LOAD_BALANCER, name: 'Load Balancers' },
            { layer: InfrastructureLayer.COMPUTE, name: 'Compute' },
            { layer: InfrastructureLayer.DATA, name: 'Data' },
            { layer: InfrastructureLayer.FOUNDATION, name: 'Foundation' }
          ].map(({ layer, name }) => (
            <label key={layer} style={{ display: 'block', margin: '3px 0' }}>
              <input
                type="checkbox"
                checked={filters.layers.includes(layer)}
                onChange={() => toggleLayer(layer)}
                style={{ marginRight: '5px' }}
              />
              {name} ({data.metadata.layerCounts[layer] || 0})
            </label>
          ))}
        </div>

        <div>
          <label style={{ display: 'block', margin: '3px 0' }}>
            <input
              type="checkbox"
              checked={filters.showRelationships}
              onChange={(e) => setFilters(prev => ({ ...prev, showRelationships: e.target.checked }))}
              style={{ marginRight: '5px' }}
            />
            Show Relationships
          </label>
          <label style={{ display: 'block', margin: '3px 0' }}>
            <input
              type="checkbox"
              checked={filters.groupByVpc}
              onChange={(e) => setFilters(prev => ({ ...prev, groupByVpc: e.target.checked }))}
              style={{ marginRight: '5px' }}
            />
            Group by VPC
          </label>
        </div>
      </div>

      {selectedNode && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '300px',
          border: '1px solid #e1e5e9'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>
            {getResourceSymbol(selectedNode.type)} {selectedNode.name}
          </h4>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            <div><strong>Type:</strong> {selectedNode.type}</div>
            <div><strong>Layer:</strong> {selectedNode.layer}</div>
            <div><strong>Group:</strong> {selectedNode.group}</div>
            {selectedNode.metadata.region && <div><strong>Region:</strong> {selectedNode.metadata.region}</div>}
            {selectedNode.metadata.arn && (
              <div style={{ wordBreak: 'break-all' }}>
                <strong>ARN:</strong> {selectedNode.metadata.arn}
              </div>
            )}
          </div>
          <button 
            onClick={() => setSelectedNode(null)}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              background: '#f8f9fa',
              border: '1px solid #ddd',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}; 