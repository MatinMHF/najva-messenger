import { Transport, Producer, Consumer } from 'mediasoup/node/lib/types';

export class Peer {
  public id: string;
  public userId: string;
  public transports: Map<string, Transport>;
  public producers: Map<string, Producer>;
  public consumers: Map<string, Consumer>;

  constructor(id: string, userId: string) {
    this.id = id;
    this.userId = userId;
    this.transports = new Map();
    this.producers = new Map();
    this.consumers = new Map();
  }

  public addTransport(transport: Transport) {
    this.transports.set(transport.id, transport);
  }

  public getTransport(id: string): Transport | undefined {
    return this.transports.get(id);
  }

  public addProducer(producer: Producer) {
    this.producers.set(producer.id, producer);
  }

  public getProducer(id: string): Producer | undefined {
    return this.producers.get(id);
  }

  public addConsumer(consumer: Consumer) {
    this.consumers.set(consumer.id, consumer);
  }

  public getConsumer(id: string): Consumer | undefined {
    return this.consumers.get(id);
  }

  public close() {
    this.transports.forEach(transport => transport.close());
    this.transports.clear();
    this.producers.clear();
    this.consumers.clear();
  }
}
