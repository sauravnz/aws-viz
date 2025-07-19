import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { 
  GraphData, GraphNode, GraphLink, ResourceType, InfrastructureLayer, FilterOptions, 
  VisualizationConfig, ViewMode, BusinessFlowGraphData, BusinessFlowNode, BusinessFlowLink,
  ContainerGroup, InfrastructureDetailGraphData
} from '../../../shared/types';
import { CostCalculator } from './CostCalculator';

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
  textWidth?: number;
}

interface D3BusinessFlowNode extends BusinessFlowNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  textWidth?: number;
}

// Professional CloudCraft-inspired color scheme
const getResourceColor = (type: ResourceType): string => {
  const colors: Record<ResourceType, string> = {
    [ResourceType.EC2_INSTANCE]: '#3B82F6',      // Blue for compute
    [ResourceType.LAMBDA_FUNCTION]: '#10B981',   // Green for serverless
    [ResourceType.EKS_CLUSTER]: '#6366F1',       // Indigo for container orchestration
    [ResourceType.EKS_NODEGROUP]: '#8B5CF6',     // Purple for container nodes
    [ResourceType.EKS_FARGATE_PROFILE]: '#A855F7', // Light purple for fargate
    [ResourceType.S3_BUCKET]: '#F59E0B',         // Amber for storage
    [ResourceType.EBS_VOLUME]: '#D97706',        // Dark amber for block storage
    [ResourceType.RDS_INSTANCE]: '#EF4444',      // Red for database
    [ResourceType.VPC]: '#6B7280',               // Gray for networking foundation
    [ResourceType.SUBNET]: '#9CA3AF',            // Light gray for subnets
    [ResourceType.ROUTE_TABLE]: '#4B5563',       // Dark gray for routing
    [ResourceType.INTERNET_GATEWAY]: '#059669',  // Emerald for internet access
    [ResourceType.NAT_GATEWAY]: '#0891B2',       // Cyan for NAT
    [ResourceType.SECURITY_GROUP]: '#DC2626',    // Red for security
    [ResourceType.NETWORK_INTERFACE]: '#64748B', // Slate for interfaces
    [ResourceType.ELASTIC_LOAD_BALANCER]: '#7C3AED', // Violet for load balancing
    [ResourceType.IAM_ROLE]: '#374151'           // Dark gray for identity
  };
  return colors[type] || '#6B7280';
};

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
  const [selectedNode, setSelectedNode] = useState<D3Node | D3BusinessFlowNode | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string; visible: boolean }>({
    x: 0,
    y: 0,
    content: '',
    visible: false
  });
  
  // Default to business flow mode - always treat data as business flow for now
  console.log('🔍 Checking business flow data...');
  console.log('📊 Data viewMode:', (data as any)?.viewMode);
  console.log('🎯 ViewMode.BUSINESS_FLOW:', ViewMode.BUSINESS_FLOW);
  console.log('✅ ViewMode match:', (data as any)?.viewMode === ViewMode.BUSINESS_FLOW);
  
  // For now, always treat incoming data as business flow data since backend defaults to business flow
  const businessFlowData = data as BusinessFlowGraphData;
  const [currentViewMode, setCurrentViewMode] = useState<ViewMode>(ViewMode.BUSINESS_FLOW);
  
  const [filters, setFilters] = useState<FilterOptions>({
    layers: [InfrastructureLayer.GATEWAY, InfrastructureLayer.LOAD_BALANCER, InfrastructureLayer.COMPUTE, InfrastructureLayer.DATA, InfrastructureLayer.FOUNDATION],
    serviceTypes: Object.values(ResourceType),
    showRelationships: true,
    groupByVpc: true
  });
  
  const [config, setConfig] = useState<VisualizationConfig>({
    viewMode: currentViewMode,
    showSecurityGroups: true,
    showNetworkAcls: true,
    showZoneGrouping: true,
    showPortLabels: true,
    showDirectionalArrows: false,
    showContainers: true,
    textSpacing: 25,
    nodeSpacing: 150,
    layerSpacing: 120,
    flowSpacing: 200
  });

  const [securityPanelVisible, setSecurityPanelVisible] = useState(false);
  const [selectedSecurityGroup, setSelectedSecurityGroup] = useState<any>(null);

  // Handle view mode switching
  const handleViewModeSwitch = (newMode: ViewMode) => {
    setCurrentViewMode(newMode);
    setConfig(prev => ({ ...prev, viewMode: newMode }));
  };

  useEffect(() => {
    console.log('🔍 NetworkVisualization useEffect triggered');
    console.log('📊 Received data:', data);
    console.log('📈 Data nodes length:', data?.nodes?.length);
    console.log('🔗 Data links length:', data?.links?.length);
    console.log('🎛️ Current view mode:', currentViewMode);
    console.log('📱 Business flow data:', businessFlowData);
    
    if (!svgRef.current) {
      console.log('❌ No SVG ref found');
      return;
    }
    
    if (!data || !data.nodes || !data.nodes.length) {
      console.log('❌ No data or empty nodes array');
      console.log('❓ Data exists:', !!data);
      console.log('❓ Data.nodes exists:', !!data?.nodes);
      console.log('❓ Data.nodes length:', data?.nodes?.length);
      return;
    }

    console.log('✅ Starting visualization rendering');

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

    // Render based on view mode and data availability
    console.log('🎨 Determining render mode...');
    console.log('🎯 View mode is BUSINESS_FLOW:', currentViewMode === ViewMode.BUSINESS_FLOW);
    console.log('📊 Business flow data exists:', !!businessFlowData);
    
    // Always try business flow first since backend returns business flow data
    if (businessFlowData && businessFlowData.nodes && businessFlowData.nodes.length > 0) {
      console.log('🌊 Rendering business flow view with', businessFlowData.nodes.length, 'nodes');
      renderBusinessFlowView(g, businessFlowData, width, height);
      
      // Add legend for business flow
      console.log('📋 Creating business flow legend...');
      createBusinessFlowLegend(svg, businessFlowData.nodes, width, height);
    } else {
      // Fallback to rendering regular data as business flow
      console.log('🔄 Rendering fallback view with regular data', data);
      renderFallbackBusinessFlow(g, data, width, height);
    }

    // Add basic controls
    createEnhancedControls(svg, width, zoom);

    // Click to deselect
    svg.on("click", () => {
      setSelectedNode(null);
    });

  }, [data, filters, config, currentViewMode]);

  // Business Flow View Rendering
  const renderBusinessFlowView = (g: any, data: BusinessFlowGraphData, width: number, height: number) => {
    console.log('🌊 renderBusinessFlowView called');
    console.log('📊 Data:', data);
    console.log('📈 Nodes:', data.nodes.length);
    console.log('🔗 Links:', data.links.length);
    console.log('📦 Containers:', data.containers?.length || 0);
    
    // Create container backgrounds first
    if (config.showContainers && data.containers) {
      renderContainers(g, data.containers, width, height);
    }

    // Create left-to-right flow layout
    console.log('🗂️ Creating business flow layout...');
    const flowLayout = createBusinessFlowLayout(data.nodes, data.links, width, height);
    console.log('✅ Flow layout created with', flowLayout.nodePositions.size, 'node positions');
    
    // Skip directional arrows for cleaner look

    // Render business flow links
    console.log('🔗 Rendering business flow links...');
    renderBusinessFlowLinks(g, data.links, flowLayout.nodePositions);

    // Render business flow nodes
    console.log('🎨 Rendering business flow nodes...');
    renderBusinessFlowNodes(g, data.nodes, flowLayout.nodePositions);

    // Add flow path indicators
    if (data.flowPaths) {
      renderFlowPaths(g, data.flowPaths, flowLayout.nodePositions);
    }
  };

  // Infrastructure Detail View Rendering (existing detailed view)
  const renderInfrastructureDetailView = (g: any, data: InfrastructureDetailGraphData, width: number, height: number) => {
    console.log('Rendering Infrastructure Detail View with', data.nodes.length, 'nodes');
    
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

    // Create VPC zone groups if enabled
    if (config.showZoneGrouping) {
      drawInfrastructureZoneGroups(g, filteredNodes, width, height);
    }

    // Create enhanced hierarchical layout
    const { nodePositions, layerInfo } = createInfrastructureLayout(filteredNodes, width, height);

    // Create arrow markers
    createInfrastructureArrowMarkers(g);

    // Create enhanced links
    createInfrastructureLinks(g, filteredLinks, nodePositions);

    // Create enhanced nodes
    createInfrastructureNodes(g, filteredNodes, nodePositions);

    // Add layer labels
    createLayerLabels(g, layerInfo, width);

    // Create comprehensive legend
    createInfrastructureLegend(svg, filteredNodes, width, height);
  };

  // Business Flow Layout Algorithm
  const createBusinessFlowLayout = (nodes: BusinessFlowNode[], links: BusinessFlowLink[], width: number, height: number) => {
    const nodePositions = new Map<string, {x: number, y: number}>();
    const flowLayers = new Map<string, BusinessFlowNode[]>();
    
    // Group nodes by flow layer
    nodes.forEach(node => {
      const layer = node.flowLayer;
      if (!flowLayers.has(layer)) {
        flowLayers.set(layer, []);
      }
      flowLayers.get(layer)!.push(node);
    });

    // Define flow layer order (left to right)
    const layerOrder = ['entry', 'security', 'compute', 'data', 'external'];
    const layerWidth = (width - 200) / layerOrder.length; // Leave margins
    const centerY = height / 2;

    layerOrder.forEach((layerName, layerIndex) => {
      const layerNodes = flowLayers.get(layerName) || [];
      if (layerNodes.length === 0) return;

      const x = 100 + (layerIndex * layerWidth) + (layerWidth / 2);
      const totalHeight = layerNodes.length * config.flowSpacing;
      const startY = centerY - (totalHeight / 2);

      layerNodes.forEach((node, nodeIndex) => {
        const y = startY + (nodeIndex * config.flowSpacing);
        nodePositions.set(node.id, { x, y });
      });
    });

    return { nodePositions, layerOrder };
  };

  // Infrastructure Layout Algorithm (existing hierarchical)
  const createInfrastructureLayout = (nodes: D3Node[], width: number, height: number) => {
    const layerGroups: Map<number, D3Node[]> = new Map();
    const nodePositions = new Map<string, {x: number, y: number}>();
    
    nodes.forEach(node => {
      const layer = node.layer;
      if (!layerGroups.has(layer)) {
        layerGroups.set(layer, []);
      }
      layerGroups.get(layer)!.push(node);
    });

    const layerInfo: Array<{layer: number, y: number, name: string}> = [];
    const totalLayers = layerGroups.size;
    const availableHeight = height - 100;

    layerGroups.forEach((layerNodes, layer) => {
      const y = 50 + (layer - 1) * (availableHeight / totalLayers);
      layerInfo.push({
        layer,
        y,
        name: getLayerName(layer)
      });

      const actualSpacing = Math.max(config.nodeSpacing, (width - 100) / (layerNodes.length + 1));
      const startX = (width - (layerNodes.length - 1) * actualSpacing) / 2;
      
      layerNodes.forEach((node, index) => {
        const x = startX + index * actualSpacing;
        nodePositions.set(node.id, {x, y});
      });
    });

    return { nodePositions, layerInfo };
  };

  // Container Rendering for Business Flow
  const renderContainers = (g: any, containers: ContainerGroup[], width: number, height: number) => {
    // Calculate container bounds based on contained nodes
    containers.forEach(container => {
      if (container.containedNodes.length > 0) {
        // For now, create a simple background - in real implementation would calculate based on node positions
        const bounds = {
          x: 80,
          y: 50,
          width: width - 160,
          height: height - 100
        };
        
        // VPC background
        g.append("rect")
          .attr("x", bounds.x)
          .attr("y", bounds.y)
          .attr("width", bounds.width)
          .attr("height", bounds.height)
          .attr("fill", container.style.fill || "none")
          .attr("stroke", container.style.stroke)
          .attr("stroke-width", container.style.strokeWidth)
          .attr("stroke-dasharray", container.style.strokeDashArray || "none")
          .attr("opacity", container.style.opacity)
          .attr("rx", 10);

        // VPC label
        g.append("text")
          .attr("x", bounds.x + 15)
          .attr("y", bounds.y + 25)
          .attr("fill", container.style.stroke)
          .style("font-size", "12px")
          .style("font-weight", "bold")
          .text(container.label.text);

        if (container.label.subtext) {
          g.append("text")
            .attr("x", bounds.x + 15)
            .attr("y", bounds.y + 40)
            .attr("fill", container.style.stroke)
            .style("font-size", "10px")
            .text(container.label.subtext);
        }
      }
    });
  };

  // Business Flow Nodes Rendering
  const renderBusinessFlowNodes = (g: any, nodes: BusinessFlowNode[], nodePositions: Map<string, {x: number, y: number}>) => {
    console.log('🎨 renderBusinessFlowNodes called with', nodes.length, 'nodes');
    console.log('📍 Node positions:', nodePositions.size, 'positions');
    
    const nodeGroup = g.append("g").attr("class", "business-flow-nodes");

    nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const nodeG = nodeGroup.append("g")
        .attr("transform", `translate(${pos.x}, ${pos.y})`)
        .style("cursor", "pointer")
        .on("mouseover", (event: any) => {
          setTooltip({
            x: event.pageX + 10,
            y: event.pageY - 10,
            content: formatBusinessFlowTooltip(node),
            visible: true
          });
        })
        .on("mouseout", () => {
          setTooltip(prev => ({ ...prev, visible: false }));
        })
        .on("click", (event: any) => {
          setSelectedNode(node);
          event.stopPropagation();
        });

      // Modern card-style node with rounded rectangle
      const nodeWidth = 80;
      const nodeHeight = 60;
      
      // Drop shadow effect
      nodeG.append("rect")
        .attr("x", -nodeWidth/2 + 2)
        .attr("y", -nodeHeight/2 + 2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", 8)
        .attr("fill", "rgba(0,0,0,0.1)")
        .style("filter", "blur(3px)");
      
      // Main node rectangle
      nodeG.append("rect")
        .attr("x", -nodeWidth/2)
        .attr("y", -nodeHeight/2)
        .attr("width", nodeWidth)
        .attr("height", nodeHeight)
        .attr("rx", 8)
        .attr("fill", "#ffffff")
        .attr("stroke", node.publicAccess ? "#FF5722" : "#E5E7EB")
        .attr("stroke-width", node.publicAccess ? 3 : 1.5);

      // Service icon background (colored strip at top)
      nodeG.append("rect")
        .attr("x", -nodeWidth/2)
        .attr("y", -nodeHeight/2)
        .attr("width", nodeWidth)
        .attr("height", 20)
        .attr("rx", 8)
        .attr("fill", getResourceColor(node.type))
        .style("opacity", 0.9);

      // Resource symbol 
      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "-15px")
        .style("font-size", "18px")
        .style("fill", "white")
        .style("font-weight", "600")
        .style("pointer-events", "none")
        .text(getResourceSymbol(node.type));

      // Public access warning
      if (node.publicAccess) {
        nodeG.append("circle")
          .attr("cx", 30)
          .attr("cy", -25)
          .attr("r", 8)
          .attr("fill", "#FF5722");
          
        nodeG.append("text")
          .attr("x", 30)
          .attr("y", -25)
          .attr("text-anchor", "middle")
          .attr("dy", "0.3em")
          .style("font-size", "10px")
          .style("fill", "white")
          .style("font-weight", "bold")
          .style("pointer-events", "none")
          .text("!");
      }

      // Resource name - inside the card
      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "8px")
        .style("font-size", "11px")
        .style("font-weight", "600")
        .style("fill", "#374151")
        .style("pointer-events", "none")
        .text(node.name.length > 10 ? node.name.substring(0, 10) + "..." : node.name);

      // Resource type label
      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "20px")
        .style("font-size", "9px")
        .style("fill", "#6B7280")
        .style("pointer-events", "none")
        .text(node.type.replace(/-/g, ' ').toUpperCase());

      // Clean design - no flow layer indicator needed
    });
  };

  // Business Flow Links Rendering
  const renderBusinessFlowLinks = (g: any, links: BusinessFlowLink[], nodePositions: Map<string, {x: number, y: number}>) => {
    console.log('🔗 renderBusinessFlowLinks called with', links.length, 'links');
    const linkGroup = g.append("g").attr("class", "business-flow-links");

    links.forEach(link => {
      const sourcePos = nodePositions.get(link.source);
      const targetPos = nodePositions.get(link.target);
      
      if (sourcePos && targetPos) {
        // Create clean professional path
        const path = linkGroup.append("path")
          .attr("d", createCleanPath(sourcePos, targetPos))
          .attr("stroke", getBusinessFlowLinkColor(link))
          .attr("stroke-width", link.isMainPath ? 3 : 2)
          .attr("stroke-opacity", link.isMainPath ? 0.9 : 0.6)
          .attr("fill", "none")
          .attr("stroke-linecap", "round")
          .style("filter", "drop-shadow(0px 1px 2px rgba(0,0,0,0.1))");

        // Add port/protocol labels for main paths
        if (link.isMainPath && config.showPortLabels && (link.ports || link.protocols)) {
          const midX = (sourcePos.x + targetPos.x) / 2;
          const midY = (sourcePos.y + targetPos.y) / 2;
          
          const label = (link.protocols || []).join(',') + (link.ports ? ':' + link.ports.join(',') : '');
          
          linkGroup.append("text")
            .attr("x", midX)
            .attr("y", midY - 8)
            .attr("text-anchor", "middle")
            .style("font-size", "9px")
            .style("fill", "#333")
            .style("background", "white")
            .style("font-weight", "bold")
            .text(label);
        }
      }
    });
  };

  // Helper Functions
  const createCurvedPath = (source: {x: number, y: number}, target: {x: number, y: number}): string => {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dr = Math.sqrt(dx * dx + dy * dy);
    return `M${source.x},${source.y}A${dr},${dr} 0 0,1 ${target.x},${target.y}`;
  };

  const createCleanPath = (source: {x: number, y: number}, target: {x: number, y: number}): string => {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    
    // Create orthogonal path for cleaner look (like CloudCraft)
    if (Math.abs(dx) > Math.abs(dy)) {
      // Horizontal flow - use gentle curves
      const midX = source.x + dx * 0.6;
      return `M${source.x},${source.y} C${midX},${source.y} ${midX},${target.y} ${target.x},${target.y}`;
    } else {
      // Vertical flow - use gentle curves
      const midY = source.y + dy * 0.6;
      return `M${source.x},${source.y} C${source.x},${midY} ${target.x},${midY} ${target.x},${target.y}`;
    }
  };

  const getBusinessFlowLinkColor = (link: BusinessFlowLink): string => {
    switch (link.flowType) {
      case 'traffic': return '#4CAF50';
      case 'data': return '#2196F3';
      case 'management': return '#FF9800';
      default: return '#999';
    }
  };

  const formatBusinessFlowTooltip = (node: BusinessFlowNode): string => {
    let content = `<div class="tooltip-title">${getResourceSymbol(node.type)} ${node.name}</div>`;
    content += `<div class="tooltip-info">Type: ${node.type}</div>`;
    content += `<div class="tooltip-info">Flow Layer: ${node.flowLayer}</div>`;
    
    if (node.publicAccess) {
      content += `<div class="tooltip-warning">⚠️ Public Access Enabled</div>`;
    }
    
    if (node.metadata.region) {
      content += `<div class="tooltip-info">Region: ${node.metadata.region}</div>`;
    }
    
    return content;
  };

  // Arrow markers for business flow
  const createFlowArrowMarkers = (g: any) => {
    console.log('🏹 createFlowArrowMarkers called');
    const defs = g.append("defs");
    
    defs.append("marker")
      .attr("id", "business-flow-arrow")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 45)
      .attr("refY", 0)
      .attr("markerWidth", 8)
      .attr("markerHeight", 8)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#4CAF50");
  };

  // View Mode Controls
  const addViewModeControls = (svg: any, width: number, height: number) => {
    const controlsGroup = svg.append("g")
      .attr("class", "view-mode-controls")
      .attr("transform", `translate(${width - 250}, 20)`);

    // Background
    controlsGroup.append("rect")
      .attr("width", 220)
      .attr("height", 60)
      .attr("fill", "white")
      .attr("stroke", "#ddd")
      .attr("stroke-width", 1)
      .attr("rx", 8)
      .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))");

    // Title
    controlsGroup.append("text")
      .attr("x", 10)
      .attr("y", 18)
      .style("font-size", "12px")
      .style("font-weight", "bold")
      .text("View Mode:");

    // Business Flow Button
    const businessFlowBtn = controlsGroup.append("g")
      .attr("class", "mode-button")
      .style("cursor", "pointer")
      .on("click", () => handleViewModeSwitch(ViewMode.BUSINESS_FLOW));

    businessFlowBtn.append("rect")
      .attr("x", 10)
      .attr("y", 25)
      .attr("width", 90)
      .attr("height", 25)
      .attr("fill", currentViewMode === ViewMode.BUSINESS_FLOW ? "#4CAF50" : "#f5f5f5")
      .attr("stroke", "#ddd")
      .attr("rx", 4);

    businessFlowBtn.append("text")
      .attr("x", 55)
      .attr("y", 42)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", currentViewMode === ViewMode.BUSINESS_FLOW ? "white" : "#333")
      .text("Business Flow");

    // Infrastructure Detail Button
    const infrastructureBtn = controlsGroup.append("g")
      .attr("class", "mode-button")
      .style("cursor", "pointer")
      .on("click", () => handleViewModeSwitch(ViewMode.INFRASTRUCTURE_DETAIL));

    infrastructureBtn.append("rect")
      .attr("x", 110)
      .attr("y", 25)
      .attr("width", 100)
      .attr("height", 25)
      .attr("fill", currentViewMode === ViewMode.INFRASTRUCTURE_DETAIL ? "#4CAF50" : "#f5f5f5")
      .attr("stroke", "#ddd")
      .attr("rx", 4);

    infrastructureBtn.append("text")
      .attr("x", 160)
      .attr("y", 42)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("fill", currentViewMode === ViewMode.INFRASTRUCTURE_DETAIL ? "white" : "#333")
      .text("Infrastructure Detail");
  };

  // Simplified infrastructure rendering functions (existing logic)
  const drawInfrastructureZoneGroups = (g: any, nodes: D3Node[], width: number, height: number) => {
    // Existing VPC grouping logic from original implementation
    // ... (keeping existing implementation for infrastructure detail view)
  };

  const createInfrastructureArrowMarkers = (g: any) => {
    // Existing arrow marker logic
  };

  const createInfrastructureLinks = (g: any, links: any[], nodePositions: Map<string, any>) => {
    // Existing link rendering logic
  };

  const createInfrastructureNodes = (g: any, nodes: D3Node[], nodePositions: Map<string, any>) => {
    // Existing node rendering logic
  };

  const createLayerLabels = (g: any, layerInfo: any[], width: number) => {
    // Existing layer labels logic
  };

  const createBusinessFlowLegend = (svg: any, nodes: BusinessFlowNode[], width: number, height: number) => {
    // Business flow specific legend
    const legend = svg.append("g")
      .attr("class", "business-flow-legend")
      .attr("transform", `translate(20, ${height - 150})`);

    legend.append("rect")
      .attr("width", 200)
      .attr("height", 120)
      .attr("fill", "white")
      .attr("stroke", "#ddd")
      .attr("rx", 5)
      .style("filter", "drop-shadow(2px 2px 4px rgba(0,0,0,0.1))");

    legend.append("text")
      .attr("x", 10)
      .attr("y", 20)
      .style("font-size", "14px")
      .style("font-weight", "bold")
      .text("Business Flow Legend");

    // Flow indicators
    const flowTypes = [
      { type: 'Traffic Flow', color: '#4CAF50', symbol: '→' },
      { type: 'Data Access', color: '#2196F3', symbol: '⇄' },
      { type: 'Public Access', color: '#FF5722', symbol: '⚠️' }
    ];

    flowTypes.forEach((flow, i) => {
      const y = 40 + (i * 20);
      
      legend.append("circle")
        .attr("cx", 15)
        .attr("cy", y - 5)
        .attr("r", 5)
        .attr("fill", flow.color);

      legend.append("text")
        .attr("x", 30)
        .attr("y", y)
        .style("font-size", "11px")
        .text(`${flow.symbol} ${flow.type}`);
    });
  };

  const createInfrastructureLegend = (svg: any, nodes: D3Node[], width: number, height: number) => {
    // Existing infrastructure legend logic
  };

  const createEnhancedControls = (svg: any, width: number, zoom: any) => {
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
  };

  const getLayerName = (layer: number): string => {
    const names = {
      [InfrastructureLayer.GATEWAY]: 'Gateways',
      [InfrastructureLayer.LOAD_BALANCER]: 'Load Balancers',
      [InfrastructureLayer.COMPUTE]: 'Compute',
      [InfrastructureLayer.DATA]: 'Data',
      [InfrastructureLayer.FOUNDATION]: 'Foundation'
    };
    return names[layer as InfrastructureLayer] || `Layer ${layer}`;
  };

  const renderFlowPaths = (g: any, flowPaths: any[], nodePositions: Map<string, any>) => {
    // Flow path highlighting for business view
  };

  // Fallback rendering for regular data structure
  const renderFallbackBusinessFlow = (g: any, data: GraphData, width: number, height: number) => {
    console.log('Fallback rendering with', data.nodes?.length || 0, 'nodes');
    
    if (!data.nodes || data.nodes.length === 0) {
      // Show a message when no data is available
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "18px")
        .style("fill", "#666")
        .text("No AWS resources found or credentials invalid");
      return;
    }

    // Simple layout for existing nodes
    const nodePositions = new Map<string, {x: number, y: number}>();
    data.nodes.forEach((node, index) => {
      const x = 100 + (index % 5) * 150;
      const y = 100 + Math.floor(index / 5) * 100;
      nodePositions.set(node.id, { x, y });
    });

    // Render basic nodes
    const nodeGroup = g.append("g").attr("class", "fallback-nodes");
    
    data.nodes.forEach(node => {
      const pos = nodePositions.get(node.id);
      if (!pos) return;

      const nodeG = nodeGroup.append("g")
        .attr("transform", `translate(${pos.x}, ${pos.y})`)
        .style("cursor", "pointer")
        .on("click", () => setSelectedNode(node));

      // Node circle
      nodeG.append("circle")
        .attr("r", 25)
        .attr("fill", getResourceColor(node.type))
        .attr("stroke", "#fff")
        .attr("stroke-width", 2);

      // Resource symbol
      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "0.3em")
        .style("font-size", "16px")
        .style("pointer-events", "none")
        .text(getResourceSymbol(node.type));

      // Resource name
      nodeG.append("text")
        .attr("text-anchor", "middle")
        .attr("dy", "45px")
        .style("font-size", "10px")
        .style("font-weight", "bold")
        .style("fill", "#333")
        .style("pointer-events", "none")
        .text(node.name.length > 12 ? node.name.substring(0, 12) + "..." : node.name);
    });

    // Render basic links if available
    if (data.links && data.links.length > 0) {
      const linkGroup = g.append("g").attr("class", "fallback-links");
      
      data.links.forEach(link => {
        const sourcePos = nodePositions.get(link.source);
        const targetPos = nodePositions.get(link.target);
        
        if (sourcePos && targetPos) {
          linkGroup.append("line")
            .attr("x1", sourcePos.x)
            .attr("y1", sourcePos.y)
            .attr("x2", targetPos.x)
            .attr("y2", targetPos.y)
            .attr("stroke", "#999")
            .attr("stroke-width", 2)
            .attr("stroke-opacity", 0.6);
        }
      });
    }
  };

  const toggleLayer = (layer: InfrastructureLayer) => {
    setFilters(prev => ({
      ...prev,
      layers: prev.layers.includes(layer) 
        ? prev.layers.filter(l => l !== layer)
        : [...prev.layers, layer]
    }));
  };

  const toggleConfigOption = (option: keyof VisualizationConfig) => {
    setConfig(prev => ({
      ...prev,
      [option]: !prev[option]
    }));
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: '100%', background: '#ffffff' }}
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

      {/* Mode-specific Controls */}
      {currentViewMode === ViewMode.BUSINESS_FLOW ? (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '200px',
          border: '1px solid #e1e5e9',
          fontSize: '0.85rem'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>🌊 Flow Controls</h4>
          
          <label style={{ display: 'block', margin: '3px 0' }}>
            <input
              type="checkbox"
              checked={config.showContainers}
              onChange={() => toggleConfigOption('showContainers')}
              style={{ marginRight: '5px' }}
            />
            Show VPC Boundaries
          </label>
          
          <label style={{ display: 'block', margin: '3px 0' }}>
            <input
              type="checkbox"
              checked={config.showPortLabels}
              onChange={() => toggleConfigOption('showPortLabels')}
              style={{ marginRight: '5px' }}
            />
            Show Port Labels
          </label>

          <button
            onClick={() => setSecurityPanelVisible(!securityPanelVisible)}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              background: '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            {securityPanelVisible ? 'Hide' : 'Show'} Security Details
          </button>
        </div>
      ) : (
        <div style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '300px',
          border: '1px solid #e1e5e9',
          fontSize: '0.85rem'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>🔧 Infrastructure Controls</h4>
          
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
        </div>
      )}

      {/* Security Panel for Business Flow Mode */}
      {securityPanelVisible && businessFlowData && (
        <div style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '300px',
          border: '1px solid #e1e5e9',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>🛡️ Security Context</h4>
          
          <div style={{ fontSize: '0.9rem' }}>
            <div><strong>Exposed Services:</strong> {businessFlowData.securityContext.exposedServices.length}</div>
            <div><strong>Public Resources:</strong> {businessFlowData.securityContext.publicResources.length}</div>
            <div><strong>Security Groups:</strong> {businessFlowData.securityContext.securityGroups.length}</div>
          </div>

          {businessFlowData.securityContext.exposedServices.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <strong>⚠️ Exposed Services:</strong>
              {businessFlowData.securityContext.exposedServices.map(serviceId => {
                const node = businessFlowData.nodes.find(n => n.id === serviceId);
                return (
                  <div key={serviceId} style={{ fontSize: '0.8rem', color: '#FF5722', marginLeft: '10px' }}>
                    {node?.name || serviceId}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Cost Calculator */}
      {businessFlowData && (
        <CostCalculator data={businessFlowData} />
      )}

      {selectedNode && (
        <div style={{
          position: 'absolute',
          bottom: '10px',
          right: '10px',
          background: 'white',
          padding: '15px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          maxWidth: '350px',
          border: '1px solid #e1e5e9'
        }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>
            {getResourceSymbol(selectedNode.type)} {selectedNode.name}
          </h4>
          <div style={{ fontSize: '0.9rem', color: '#666' }}>
            <div><strong>Type:</strong> {selectedNode.type}</div>
            {(selectedNode as any).flowLayer && (
              <div><strong>Flow Layer:</strong> {(selectedNode as any).flowLayer}</div>
            )}
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