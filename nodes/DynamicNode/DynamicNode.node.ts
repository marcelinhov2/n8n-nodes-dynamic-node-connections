import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';

// JSON import requires "resolveJsonModule" in tsconfig
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
    // 1) Pull in the incoming items
    const items = this.getInputData();

    // 2) Get the user-provided node JSON (string or object)
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

    // —— UNWRAP & CLEANUP ——
    // 3) If it’s a full export, pull out the first node
    let nodeJson: any;
    if (Array.isArray(raw.nodes) && raw.nodes.length > 0) {
      nodeJson = raw.nodes[0];
    } else {
      nodeJson = raw;
    }
    // 4) Remove export-only keys
    delete nodeJson.connections;
    delete nodeJson.pinData;
    delete nodeJson.meta;
    // 5) Validate it still has a name
    if (!nodeJson.name) {
      throw new NodeOperationError(this.getNode(), 'Your JSON must include a `name` field');
    }

    // —— AVOID COLLISIONS ——
    // 6) Suffix the name and assign a fresh ID
    nodeJson.name = `${nodeJson.name} - Dynamic Node`;
    nodeJson.id   = `dynamic-${uuidv4()}`;

    // —— DEFAULT POSITION ——
    // 7) Ensure a valid position array
    if (
      !nodeJson.position ||
      !Array.isArray(nodeJson.position) ||
      nodeJson.position.length !== 2 ||
      typeof nodeJson.position[0] !== 'number' ||
      typeof nodeJson.position[1] !== 'number'
    ) {
      nodeJson.position = [240, 0];
    }

    // 8) Clone the sub-workflow template
    const template = JSON.parse(JSON.stringify(subWorkflowTemplate)) as any;

    // 9) Inject & wire
    template.nodes.push(nodeJson);
    template.connections.Start.main[0][0].node = nodeJson.name;

    // 10) Execute the mini-workflow to completion
    const workflowProxy = this.getWorkflowDataProxy(0);
    const executionResult: any = await this.executeWorkflow(
      { code: template },
      items,
      {},
      {
        parentExecution: {
          executionId: workflowProxy.$execution.id,
          workflowId:  workflowProxy.$workflow.id,
        },
        doNotWaitToFinish: false,
      },
    );

    // 11) Process executionResult (either your original logic or the suggested one)
    let returnedData: INodeExecutionData[][] = [];
    if (Array.isArray(executionResult)) {
      returnedData = executionResult;
    } else if (executionResult && typeof executionResult === 'object' && 'data' in executionResult) {
        // A slightly more robust check for the { data: ... } structure
        if (Array.isArray(executionResult.data)) {
            returnedData = executionResult.data as INodeExecutionData[][];
        } else {
            // Handle cases where executionResult.data might not be an array as expected
            console.warn('DynamicNode: executionResult.data was not an array, attempting to wrap.');
            // This part is speculative and depends on what executeWorkflow might return in edge cases
            // For now, let's assume it should be an array or we make it an empty one
            returnedData = [];
        }
    } else if (executionResult === null || executionResult === undefined) {
        console.warn('DynamicNode: executionResult was null or undefined.');
        returnedData = []; // Default to empty if nothing came back
    }
    // Add detailed logging
    console.log('DynamicNode: Final returnedData structure:', JSON.stringify(returnedData, null, 2));
    if (returnedData && returnedData[0] && returnedData[0][0]) {
        console.log('DynamicNode: JSON content of the first item:', JSON.stringify(returnedData[0][0].json, null, 2));
    } else {
        console.log('DynamicNode: No valid first item found in returnedData to inspect .json property.');
    }

    return returnedData;
  }
}
