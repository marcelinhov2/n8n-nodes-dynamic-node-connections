import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';
import { WorkflowExecuteAdditionalData, WorkflowExecute, WorkflowExecuteMode } from 'n8n-core';

export class DynamicNode implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Dynamic Node',
    name: 'dynamicNode',
    icon: 'file:dynamicNode.svg',
    group: ['transform'],
    version: 1,
    description: 'Wraps a full node JSON and executes it dynamically',
    defaults: {
      name: 'Dynamic Node',
      color: '#00BB00',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Node JSON',
        name: 'nodeJson',
        type: 'json',
        default: {},
        description: 'Full node definition (as in workflow export) to execute',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    // Retrieve the JSON for the node to run
    const nodeJson = this.getNodeParameter('nodeJson', 0) as any;
    if (!nodeJson || typeof nodeJson !== 'object') {
      throw new NodeOperationError(this.getNode(), 'nodeJson must be a valid JSON object');
    }

    // Helper function to recursively evaluate expressions in the JSON
    const evaluateExpressions = (obj: any): any => {
      if (typeof obj === 'string' && obj.includes('{{')) {
        return this.evaluateExpression(obj, 0);
      } else if (Array.isArray(obj)) {
        return obj.map(evaluateExpressions);
      } else if (typeof obj === 'object' && obj !== null) {
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [key, evaluateExpressions(value)])
        );
      }
      return obj;
    };

    // Evaluate all expressions in the node JSON
    const evaluatedNodeJson = evaluateExpressions(nodeJson);

    // Build a minimal workflow around the single node
    const workflowData = {
      name: 'DynamicWorkflow',
      nodes: [
        {
          ...evaluatedNodeJson,
          // Override position so it doesn't overlap
          position: [0, 0],
        },
      ],
      connections: {},
    };

    // Prepare the core execution engine
    const additionalData: WorkflowExecuteAdditionalData = await (this.getWorkflow() as any).getActiveWorkflow();
    const workflow = new WorkflowExecute(additionalData, workflowData);

    // Execute only the dynamic node
    const runResult = await workflow.run({
      runData: {},
      destinationNode: evaluatedNodeJson.name,
      mode: 'manual' as WorkflowExecuteMode,
    });

    // Return whatever the wrapped node returns
    return runResult; // INodeExecutionData[][]
  }
}