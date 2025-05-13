import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
  NodeConnectionType,
} from 'n8n-workflow';

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
    defaults: { name: 'Dynamic Node', color: '#00BB00' },
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

    // 2) Get the user-provided node JSON
    const raw = this.getNodeParameter('nodeJson', 0) as any;
    if (typeof raw !== 'object') {
      throw new NodeOperationError(this.getNode(), 'Node JSON must be an object');
    }

    // 3) Clone the sub-workflow template
    const template = JSON.parse(JSON.stringify(subWorkflowTemplate)) as any;

    // 4) Make sure the JSON includes a name
    if (!raw.name) {
      throw new NodeOperationError(this.getNode(), 'Your JSON must include a `name` field');
    }
    // 5) Inject the node definition
    template.nodes.push(raw);
    // 6) Wire Start -> your node
    template.connections.Start.main[0][0].node = raw.name;

    // 7) Execute the mini-workflow
    const executionResult = await this.executeWorkflow(
      { code: template },
      items,
    );

    // 8) Normalize the result: either it's an array or { data }
    let outputData: INodeExecutionData[][];
    if (Array.isArray(executionResult)) {
      outputData = executionResult;
    } else {
      outputData = (executionResult as any).data;
    }

    // 9) Prepare and return: unwrap the first output port
    const firstPortItems = outputData[0] || [];
    return this.prepareOutputData(firstPortItems);
  }
}
