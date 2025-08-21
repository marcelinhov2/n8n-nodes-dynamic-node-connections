import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';
import subWorkflowTemplate from './subWorkflowTemplate.json';

export class DynamicNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Dynamic Node',
    name: 'dynamicNode',
    icon: 'file:dynamicNode.svg',
    group: ['transform'],
    version: 1,
    description: 'Dynamically execute any node JSON within your workflow',
    defaults: { name: 'Dynamic Node' },
    inputs: ['main'] as NodeConnectionType[],
    outputs: ['main'] as NodeConnectionType[],
    properties: [
      {
        displayName: 'Node JSON',
        name: 'nodeJson',
        type: 'json',
        default: {},
        description: 'Paste in your exported node JSON here',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    // ✅ Enforce: exactly 1 item per call
    if (items.length !== 1) {
      throw new NodeOperationError(
        this.getNode(),
        `Dynamic Node must be called with exactly 1 item. Received ${items.length}.`,
      );
    }

    const rawParam = this.getNodeParameter('nodeJson', 0) as any;
    let raw: any;

    if (typeof rawParam === 'string') {
      try {
        raw = JSON.parse(rawParam);
      } catch {
        throw new NodeOperationError(
          this.getNode(),
          'Node JSON must be a valid JSON object or a parseable JSON string',
        );
      }
    } else {
      raw = rawParam;
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new NodeOperationError(this.getNode(), 'Node JSON must be an object');
    }

    // Handle multiple nodes if present
    const nodes = Array.isArray(raw.nodes) && raw.nodes.length > 0 ? raw.nodes : [raw];
    const connections = raw.connections || {};

    // Process each node
    const processedNodes = nodes.map((node, index) => {
      const processedNode = { ...node };
      
      // Remove pinData and meta but preserve connections
      delete processedNode.pinData;
      delete processedNode.meta;
      
      if (!processedNode.name) {
        throw new NodeOperationError(this.getNode(), 'Each node must include a `name` field');
      }
      
      // Update node properties for dynamic execution
      const originalName = processedNode.name;
      processedNode.name = `${originalName} - Dynamic Node`;
      processedNode.id = `dynamic-${uuidv4()}`;
      processedNode.position = [240, index * 200]; // Stack nodes vertically
      
      return { processedNode, originalName };
    });

    const template = JSON.parse(JSON.stringify(subWorkflowTemplate));
    
    // Add all processed nodes to template
    processedNodes.forEach(({ processedNode }) => {
      template.nodes.push(processedNode);
    });
    
    // Update connections to use new node names
    const updatedConnections = {};
    Object.keys(connections).forEach(nodeName => {
      const nodeConnections = connections[nodeName];
      const processedNode = processedNodes.find(pn => pn.originalName === nodeName);
      
      if (processedNode) {
        const newNodeName = processedNode.processedNode.name;
        updatedConnections[newNodeName] = {};
        
        Object.keys(nodeConnections).forEach(outputType => {
          updatedConnections[newNodeName][outputType] = nodeConnections[outputType].map(connectionArray => 
            connectionArray.map(connection => {
              const targetProcessedNode = processedNodes.find(pn => pn.originalName === connection.node);
              if (targetProcessedNode) {
                return {
                  ...connection,
                  node: targetProcessedNode.processedNode.name
                };
              }
              return connection;
            })
          );
        });
      }
    });
    
    // Add updated connections to template
    Object.assign(template.connections, updatedConnections);
    
    // Connect Start node to the first processed node
    if (processedNodes.length > 0) {
      template.connections.Start.main[0][0].node = processedNodes[0].processedNode.name;
    }
    
    // Ensure the Start node connection is properly set up
    if (!template.connections.Start || !template.connections.Start.main || !template.connections.Start.main[0]) {
      template.connections.Start = {
        main: [
          [
            {
              node: processedNodes[0].processedNode.name,
              type: "main",
              index: 0
            }
          ]
        ]
      };
    }
    
    // Debug logging
    this.logger.debug(`DynamicNode: Processed ${processedNodes.length} nodes`);
    this.logger.debug(`DynamicNode: Original connections: ${JSON.stringify(connections)}`);
    this.logger.debug(`DynamicNode: Updated connections: ${JSON.stringify(updatedConnections)}`);
    this.logger.debug(`DynamicNode: Final template connections: ${JSON.stringify(template.connections)}`);

    const workflowProxy = this.getWorkflowDataProxy(0);

    const executionResult: any = await this.executeWorkflow(
      { code: template },
      items,
      {},
      {
        parentExecution: {
          executionId: workflowProxy.$execution.id,
          workflowId: workflowProxy.$workflow.id,
        },
        doNotWaitToFinish: false,
      },
    );

    let returnedData: INodeExecutionData[][] = [];

    if (Array.isArray(executionResult)) {
      returnedData = executionResult as INodeExecutionData[][];
    } else if (executionResult && typeof executionResult === 'object' && 'data' in executionResult) {
      if (Array.isArray((executionResult as any).data)) {
        returnedData = (executionResult as any).data as INodeExecutionData[][];
      } else {
        this.logger.warn('DynamicNode: Sub-workflow executionResult.data was not an array. Returning empty data.');
      }
    } else if (executionResult === null || executionResult === undefined) {
      this.logger.warn('DynamicNode: Sub-workflow executionResult was null or undefined. Returning empty data.');
    } else {
      this.logger.warn(`DynamicNode: Unexpected structure from sub-workflow execution. Type: ${typeof executionResult}. Returning empty data.`);
    }

    return returnedData;
  }
}
