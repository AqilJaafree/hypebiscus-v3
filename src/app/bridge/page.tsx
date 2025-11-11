"use client";
import PageTemplate from "@/components/PageTemplate";
// import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
// import Zeus from "@/components/bridge-components/Zeus";
// import Wormhole from "@/components/bridge-components/Wormhole";

const Bridge = () => {
  return (
    <PageTemplate>
      <div className="w-full h-[90vh] flex flex-col items-center justify-center">
        <h1 className="text-4xl font-bold">Comming Soon!</h1>
      </div>
      {/* <div className="w-full h-full flex flex-col items-center justify-start">
        <Tabs defaultValue="zeus" className="lg:w-[400px] w-full lg:px-0 px-4 mb-8">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="zeus">Zeus</TabsTrigger>
            <TabsTrigger value="wormhole">Wormhole</TabsTrigger>
          </TabsList>
          <TabsContent value="zeus" className="mt-6">
            <Zeus />
          </TabsContent>
          <TabsContent value="wormhole" className="mt-6">
            <Wormhole />
          </TabsContent>
        </Tabs>
      </div> */}
    </PageTemplate>
  );
};

export default Bridge;
