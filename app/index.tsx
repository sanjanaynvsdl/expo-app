import { Link } from "expo-router";
import { Text, View } from "react-native";

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-[#e5dec3]">
      <Text className="text-black text-xl">Okay,</Text>
      
      <Link href="/location-screen">
        <Text className="text-blue-600 text-xl underline ">Go to Location Screen</Text>
      </Link>
    </View>
  );
}




