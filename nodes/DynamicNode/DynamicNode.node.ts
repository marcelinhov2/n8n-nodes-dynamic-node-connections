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
      {
        displayName: 'Execute individually per item?',
        name: 'executeIndividually',
        type: 'boolean',
        default: true,
        description:
          'If enabled, each input item will run in its own sub-workflow. Disable only if your node can handle bulk items safely.',
      },
      {
        displayName: 'Disable waiting for child workflow(s) to finish?',
        name: 'doNotWaitToFinish',
        type: 'boolean',
        default: false,
        description:
          '⚠️ Advanced: If enabled, the parent will not wait for results from the sub-workflow. This may break downstream logic or lose returned data.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const inputItems = this.getInputData();
    const executeIndividually = this.getNodeParameter('executeIndividually', 0) as boolean;
    const doNotWaitToFinish = this.getNodeParameter('doNotWaitToFinish', 0) as boolean;

    const rawParam = this.getNodeParameter('nodeJson', 0) as any;
    let raw: any;
    if (typeof rawParam === 'string') {
      try {
        raw = JSON.parse(rawParam);
      } catch {
        throw new NodeOperationError(this.getNode(), 'Node JSON must be valid JSON');
      }
    } else {
      raw = rawParam;
    }

    if (typeof raw !== 'object' || raw === null) {
      throw new NodeOperationError(this.getNode(), 'Node JSON must be an object');
    }

    const baseNode = Array.isArray(raw.nodes) && raw.nodes.length > 0 ? raw.nodes[0] : raw;
    delete baseNode.connections;
    delete baseNode.pinData;
    delete baseNode.meta;

    if (!baseNode.name) {
      throw new NodeOperationError(this.getNode(), 'Your JSON must include a `name` field');
    }

    const allResults: INodeExecutionData[] = [];

    const processItem = async (item: INodeExecutionData, index: number): Promise<void> => {
      const template = JSON.parse(JSON.stringify(subWorkflowTemplate));
      const nodeClone = JSON.parse(JSON.stringify(baseNode));

      nodeClone.name = `${baseNode.name} - Dynamic Node [${index + 1}]`;
      nodeClone.id = `dynamic-${uuidv4()}`;
      nodeClone.position = Array.isArray(baseNode.position) && baseNode.position.length === 2
        ? baseNode.position
        : [240, 0];

      template.nodes.push(nodeClone);
      template.connections.Start.main[0][0].node = nodeClone.name;

      const workflowProxy = this.getWorkflowDataProxy(index);

      const execResult = await this.executeWorkflow(
        { code: template },
        [item],
        {},
        {
          parentExecution: {
            executionId: workflowProxy.$execution.id,
            workflowId: workflowProxy.$workflow.id,
          },
          doNotWaitToFinish,
        },
      );

      if (!doNotWaitToFinish && execResult) {
        if (Array.isArray(execResult)) {
          const flattened = execResult.flat().filter((item): item is INodeExecutionData => item !== null);
          allResults.push(...flattened);
        } else if (
          typeof execResult === 'object' &&
          'data' in execResult &&
          Array.isArray((execResult as any).data)
        ) {
          const flattened = (execResult as any).data.flat().filter((item): item is INodeExecutionData => item !== null);
          allResults.push(...flattened);
        }
      }
    };

    if (executeIndividually) {
      for (let i = 0; i < inputItems.length; i++) {
        try {
          await processItem(inputItems[i], i);
        } catch (err) {
          this.logger.warn(`DynamicNode: Error processing item #${i + 1}: ${err.message}`);
        }
      }
    } else {
      // Run one sub-workflow with all items
      await processItem({ json: {} }, 0);
    }

    return [allResults];
  }
}
